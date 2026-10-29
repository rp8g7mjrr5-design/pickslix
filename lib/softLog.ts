// Soft-line log (server only): each soft line we flag is saved by day, graded from the box score once its game is
// over, and rolled up into the public track record. Grading uses ESPN's free box scores, so it costs nothing.
import { kvGet, kvSet } from "./db.ts";
import { softLines } from "./edges.ts";
import { espnDate } from "./espn.ts";
import { gradeLeg } from "./grade.ts";
import type { SlateRow } from "./slateData.ts";
import { addFlags, softRecord, type SoftEntry, type SoftRecord } from "./softRecord.ts";

type DayLog = Record<string, SoftEntry>;

const dayKey = (date: string) => `softlog:${date}`;
const RECORD = "softrecord";
const KEEP_S = 45 * 86400;
const RECORD_S = 60 * 60;
/** The record covers this many days back. */
export const WINDOW_DAYS = 30;
/** A line that can't be graded after this long (player not found, no box score) is left out. */
const GIVE_UP_MS = 4 * 86400_000;

/** Save any new soft lines in a freshly scored slate. */
export async function logSoft(rows: SlateRow[], now = Date.now()) {
  const edges = softLines(rows, now);
  if (!edges.length) return;
  const key = dayKey(espnDate(new Date(now)));
  const next = addFlags((await kvGet<DayLog>(key).catch(() => null)) ?? {}, edges, now);
  if (next) await kvSet(key, next, KEEP_S).catch(() => {});
}

/** Grade a day's lines whose games are over (once each), saving any new results. */
async function gradedDay(date: string, now: number): Promise<SoftEntry[]> {
  const log = await kvGet<DayLog>(dayKey(date)).catch(() => null);
  if (!log) return [];
  const due = Object.values(log).filter((e) => {
    const t = Date.parse(e.gameTime);
    return !e.result && now > t + 3 * 3600_000 && now < t + GIVE_UP_MS;
  });
  if (due.length) {
    const results = await Promise.all(due.map((e) => gradeLeg({ ...e, savedAt: e.at }).catch(() => null)));
    let changed = false;
    due.forEach((e, i) => {
      if (results[i]) {
        e.result = results[i]!;
        changed = true;
      }
    });
    if (changed) await kvSet(dayKey(date), log, KEEP_S).catch(() => {});
  }
  return Object.values(log);
}

/** The last 30 days of soft lines, graded. Rebuilt at most once an hour. */
export async function softTrack(now = Date.now()): Promise<SoftRecord & { at: string }> {
  const cached = await kvGet<SoftRecord & { at: string }>(RECORD).catch(() => null);
  if (cached) return cached;
  const dates = Array.from({ length: WINDOW_DAYS }, (_, i) => espnDate(new Date(now - i * 86400_000)));
  const days = await Promise.all(dates.map((d) => gradedDay(d, now)));
  const body = { ...softRecord(days), at: new Date(now).toISOString() };
  await kvSet(RECORD, body, RECORD_S).catch(() => {});
  return body;
}
