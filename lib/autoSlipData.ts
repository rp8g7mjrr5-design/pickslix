// The auto slip (server only): build today's slip from the scored slate, tend it on every scan, grade past ones.
import { kvGet, kvSet } from "./db.ts";
import { espnDate } from "./espn.ts";
import { gradeLeg } from "./grade.ts";
import { autoRecord, buildSlip, settle, tendSlip, type AutoSlip } from "./autoSlip.ts";
import { getProvider } from "./providers.ts";
import { todaysSlate } from "./slateData.ts";

const dayKey = (date: string) => `auto:${date}`;
const HISTORY = "auto:history";
const KEEP_S = 400 * 86400;
/** Rescan at most this often from page loads; the scheduled check runs every 15 to 30 minutes on its own. */
const SCAN_S = 10 * 60;

const inflight = new Map<string, Promise<AutoSlip | null>>();

async function save(s: AutoSlip) {
  if (getProvider().name === "sample") return;
  await kvSet(dayKey(s.date), s, KEEP_S);
  const history = (await kvGet<AutoSlip[]>(HISTORY).catch(() => null)) ?? [];
  await kvSet(HISTORY, [s, ...history.filter((h) => h.date !== s.date)].slice(0, 365), KEEP_S);
}

/**
 * Today's slip: built on the first scan with lines up, then re-checked (at most every ten minutes) so a pick that
 * stops holding gets swapped before its game. `force` scans now regardless, for the scheduled check.
 */
export async function todaysSlip(now = Date.now(), force = false): Promise<AutoSlip | null> {
  const date = espnDate(new Date(now));
  const saved = await kvGet<AutoSlip>(dayKey(date)).catch(() => null);
  const fresh = saved && now - Date.parse(saved.updatedAt) < SCAN_S * 1000;
  if (saved && (fresh || saved.result) && !force) return saved;
  // Every pick already locked: nothing left to tend.
  if (saved && saved.legs.every((l) => Date.parse(l.gameTime) <= now)) return saved;
  if (!inflight.has(date)) {
    const run = async () => {
      const rows = (await todaysSlate(now)).rows;
      const next = saved ? tendSlip(saved, rows, now) : buildSlip(rows, date, now);
      if (next) await save(next);
      return next ?? saved;
    };
    inflight.set(date, run().catch(() => saved).finally(() => inflight.delete(date)));
  }
  return inflight.get(date)!;
}

/** Grade picks whose games are over, settle the slips they finish, and return the history (newest first). */
export async function slipHistory(now = Date.now()): Promise<AutoSlip[]> {
  const history = (await kvGet<AutoSlip[]>(HISTORY).catch(() => null)) ?? [];
  const due = history.filter((s) => !s.result && s.legs.some((l) => !l.result && now > Date.parse(l.gameTime) + 3 * 3600_000));
  if (!due.length) return history;
  const graded = await Promise.all(
    due.map(async (s) => {
      const legs = await Promise.all(
        s.legs.map(async (l) => (l.result || now <= Date.parse(l.gameTime) + 3 * 3600_000 ? l : { ...l, result: (await gradeLeg({ ...l, savedAt: l.gameTime }).catch(() => null)) ?? undefined })),
      );
      const next = { ...s, legs };
      return { ...next, result: settle(next) };
    }),
  );
  const next = history.map((s) => graded.find((g) => g.date === s.date) ?? s);
  await kvSet(HISTORY, next, KEEP_S).catch(() => {});
  await Promise.all(graded.map((s) => kvSet(dayKey(s.date), s, KEEP_S).catch(() => {})));
  return next;
}

export async function autoSummary(now = Date.now(), force = false) {
  const [slip, history] = await Promise.all([todaysSlip(now, force), slipHistory(now)]);
  const today = slip ? (history.find((s) => s.date === slip.date && s.version === slip.version) ?? slip) : null;
  return { slip: today, record: autoRecord(history), recent: history.filter((s) => s.date !== today?.date).slice(0, 14) };
}
