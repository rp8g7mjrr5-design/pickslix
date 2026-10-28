// Pick of the day (server only): take today's scored slate once, lock in the best line, and grade past picks.
import { kvGet, kvSet } from "./db.ts";
import { espnDate } from "./espn.ts";
import { gradeLeg } from "./grade.ts";
import { choosePick, potdRecord, type Potd } from "./potd.ts";
import { getProvider } from "./providers.ts";
import { todaysSlate } from "./slateData.ts";

const dayKey = (date: string) => `potd:${date}`;
const HISTORY = "potd:history";
/** After a try that found nothing, wait this long before scoring the slate again. */
const RETRY_S = 20 * 60;
const KEEP_S = 400 * 86400;

async function score(date: string, now: number): Promise<Potd | null> {
  return choosePick((await todaysSlate(now)).rows, date, now);
}

const inflight = new Map<string, Promise<Potd | null>>();

/** Today's pick: the saved one, or score the slate now and lock in the best line. */
export async function todaysPick(now = Date.now()): Promise<Potd | null> {
  const date = espnDate(new Date(now));
  const saved = await kvGet<Potd>(dayKey(date)).catch(() => null);
  if (saved) return saved;
  if (getProvider().name !== "sample" && (await kvGet(`potd:try:${date}`).catch(() => null))) return null;
  if (!inflight.has(date)) {
    const run = async () => {
      await kvSet(`potd:try:${date}`, 1, RETRY_S).catch(() => {});
      const pick = await score(date, now);
      if (pick && getProvider().name !== "sample") {
        await kvSet(dayKey(date), pick, KEEP_S);
        const history = (await kvGet<Potd[]>(HISTORY).catch(() => null)) ?? [];
        await kvSet(HISTORY, [pick, ...history.filter((p) => p.date !== date)].slice(0, 365), KEEP_S);
      }
      return pick;
    };
    inflight.set(date, run().catch(() => null).finally(() => inflight.delete(date)));
  }
  return inflight.get(date)!;
}

/** Grade past picks whose games are over, and return the history (newest first). */
export async function potdHistory(now = Date.now()): Promise<Potd[]> {
  const history = (await kvGet<Potd[]>(HISTORY).catch(() => null)) ?? [];
  const due = history.filter((p) => !p.result && now > Date.parse(p.gameTime) + 3 * 3600_000);
  if (!due.length) return history;
  const results = await Promise.all(due.map((p) => gradeLeg({ ...p, savedAt: p.gameTime }).catch(() => null)));
  let changed = false;
  const next = history.map((p) => {
    const i = due.indexOf(p);
    if (i < 0 || !results[i]) return p;
    changed = true;
    return { ...p, result: results[i]! };
  });
  if (changed) {
    await kvSet(HISTORY, next, KEEP_S).catch(() => {});
    await Promise.all(next.filter((p) => p.result && due.some((d) => d.date === p.date)).map((p) => kvSet(dayKey(p.date), p, KEEP_S).catch(() => {})));
  }
  return next;
}

export async function potdSummary(now = Date.now()) {
  const [pick, history] = await Promise.all([todaysPick(now), potdHistory(now)]);
  const today = pick ? (history.find((p) => p.date === pick.date) ?? pick) : null;
  return { pick: today, record: potdRecord(history), recent: history.filter((p) => p.result).slice(0, 10) };
}
