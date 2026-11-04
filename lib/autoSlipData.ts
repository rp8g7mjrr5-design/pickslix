// The auto slips (server only): one per sport, built from that sport's scored slate, tended on every scan, graded
// once the games are over.
import { kvGet, kvSet } from "./db.ts";
import { espnDate } from "./espn.ts";
import { gradeLeg } from "./grade.ts";
import { autoRecord, buildSlip, candidates, settle, tendSlip, type AutoSlip } from "./autoSlip.ts";
import { getProvider } from "./providers.ts";
import { sportSlate, type ScanReport } from "./slateData.ts";
import type { Sport } from "./types.ts";

/** Only NBA and NFL get an auto slip: the sports the model knows best, and the Odds API bill stays small. */
export const AUTO_SPORTS: Sport[] = ["NBA", "NFL"];
const dayKey = (sport: Sport, date: string) => `auto:${sport}:${date}`;
const historyKey = (sport: Sport) => `auto:${sport}:history`;
const KEEP_S = 400 * 86400;
/** Rescan at most this often from page loads; the scheduled check runs every 15 to 30 minutes on its own. */
const SCAN_S = 10 * 60;

const inflight = new Map<string, Promise<AutoSlip | null>>();
/** What each sport's latest scan found, for the scheduled check's log. */
export const lastScans = new Map<Sport, ScanReport & { candidates: number }>();

async function save(s: AutoSlip) {
  if (getProvider().name === "sample") return;
  await kvSet(dayKey(s.sport, s.date), s, KEEP_S);
  const history = (await kvGet<AutoSlip[]>(historyKey(s.sport)).catch(() => null)) ?? [];
  await kvSet(historyKey(s.sport), [s, ...history.filter((h) => h.date !== s.date)].slice(0, 365), KEEP_S);
}

/**
 * Today's slip for one sport: built on the first scan with lines up, then re-checked (at most every ten minutes)
 * so a pick that stops holding gets swapped before its game. `force` scans now regardless, for the scheduled check.
 */
export async function todaysSlip(sport: Sport, now = Date.now(), force = false): Promise<AutoSlip | null> {
  const date = espnDate(new Date(now));
  const saved = await kvGet<AutoSlip>(dayKey(sport, date)).catch(() => null);
  const fresh = saved && now - Date.parse(saved.updatedAt) < SCAN_S * 1000;
  if (saved && (fresh || saved.result) && !force) return saved;
  // Every pick already locked: nothing left to tend.
  if (saved && saved.legs.every((l) => Date.parse(l.gameTime) <= now)) return saved;
  const id = `${sport}:${date}`;
  if (!inflight.has(id)) {
    const run = async () => {
      const slate = await sportSlate(sport, now);
      const rows = slate.rows;
      lastScans.set(sport, { ...(slate.report ?? { games: 0, inWindow: 0, gamesWithLines: 0, lines: 0, pick6Lines: 0, rows: 0, stopped: "cached scan" }), rows: rows.length, candidates: candidates(rows.filter((r) => r.sport === sport), now).length });
      const next = saved ? tendSlip(saved, rows, now) : buildSlip(rows, sport, date, now);
      if (next) await save(next);
      return next ?? saved;
    };
    inflight.set(id, run().catch(() => saved).finally(() => inflight.delete(id)));
  }
  return inflight.get(id)!;
}

/** Grade picks whose games are over, settle the slips they finish, and return the history (newest first). */
export async function slipHistory(sport: Sport, now = Date.now()): Promise<AutoSlip[]> {
  const history = (await kvGet<AutoSlip[]>(historyKey(sport)).catch(() => null)) ?? [];
  const over = (gameTime: string) => now > Date.parse(gameTime) + 3 * 3600_000;
  const due = history.filter((s) => !s.result && s.legs.some((l) => !l.result && over(l.gameTime)));
  if (!due.length) return history;
  const graded = await Promise.all(
    due.map(async (s) => {
      const legs = await Promise.all(
        s.legs.map(async (l) => (l.result || !over(l.gameTime) ? l : { ...l, result: (await gradeLeg({ ...l, savedAt: l.gameTime }).catch(() => null)) ?? undefined })),
      );
      const next = { ...s, legs };
      return { ...next, result: settle(next) };
    }),
  );
  const next = history.map((s) => graded.find((g) => g.date === s.date) ?? s);
  await kvSet(historyKey(sport), next, KEEP_S).catch(() => {});
  await Promise.all(graded.map((s) => kvSet(dayKey(sport, s.date), s, KEEP_S).catch(() => {})));
  return next;
}

export async function sportSummary(sport: Sport, now = Date.now(), force = false) {
  const [slip, history] = await Promise.all([todaysSlip(sport, now, force), slipHistory(sport, now)]);
  const today = slip ? (history.find((s) => s.date === slip.date && s.version === slip.version) ?? slip) : null;
  return { sport, slip: today, record: autoRecord(history), recent: history.filter((s) => s.date !== today?.date).slice(0, 14) };
}

/** Every sport's slip, scanned side by side. A sport whose scan fails just shows no slip. */
export async function autoSummary(now = Date.now(), force = false) {
  const all = await Promise.allSettled(AUTO_SPORTS.map((s) => sportSummary(s, now, force)));
  return all.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

/** What each sport has saved for today, without scanning: for the sport tabs. */
export async function savedToday(now = Date.now()): Promise<{ sport: Sport; picks: number; result?: AutoSlip["result"] }[]> {
  const date = espnDate(new Date(now));
  const slips = await Promise.all(AUTO_SPORTS.map((s) => kvGet<AutoSlip>(dayKey(s, date)).catch(() => null)));
  return AUTO_SPORTS.map((sport, i) => ({ sport, picks: slips[i]?.legs.length ?? 0, result: slips[i]?.result }));
}
