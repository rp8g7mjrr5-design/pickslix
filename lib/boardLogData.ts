// Saving and grading the board (server only). Each scan folds its lines into the day's board; the daily refresh
// grades the last few days' boards from ESPN box scores (free, no Odds API credits) and keeps the graded lines
// for the model to learn from. See boardLog.ts.
import { kvGet, kvSet } from "./db.ts";
import { espnDate } from "./espn.ts";
import { gradeLegDetail } from "./grade.ts";
import { boardEntries, mergeBoard, type Board, type BoardEntry } from "./boardLog.ts";
import { getProvider } from "./providers.ts";
import type { PropWithProjection, Sport } from "./types.ts";

const dayKey = (sport: Sport, date: string) => `board:${sport}:${date}`;
const doneKey = (sport: Sport, date: string) => `board:${sport}:${date}:done`;
const gradedKey = (sport: Sport) => `board:${sport}:graded`;
const DAY_S = 86400;
/** Graded lines kept per sport: about a month of a busy slate, well under the store's size limit. */
const KEEP_GRADED = 4000;
/** Days back the refresh looks for boards still to grade. */
const LOOKBACK = 3;

/** Save this scan's lines into the day's board. Never throws: a failed save just means one scan isn't counted. */
export async function logBoard(sport: Sport, date: string, rows: PropWithProjection[], now = Date.now()): Promise<number> {
  if (getProvider().name === "sample") return 0;
  try {
    const entries = boardEntries(rows.filter((r) => r.sport === sport));
    if (!entries.length) return 0;
    const prev = (await kvGet<Board>(dayKey(sport, date)).catch(() => null)) ?? {};
    const next = mergeBoard(prev, entries, now);
    await kvSet(dayKey(sport, date), next, 7 * DAY_S);
    return Object.keys(next).length;
  } catch {
    return 0;
  }
}

/** Grade at most `limit` lines at a time against ESPN. */
async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

/**
 * Grade the last few days' boards whose games are over and add them to the graded lines. A day is marked done
 * once every line is settled, or after the lookback runs out (the stragglers are dropped).
 */
export async function gradeBoards(sports: Sport[], now = Date.now()): Promise<Record<string, string>> {
  const report: Record<string, string> = {};
  for (const sport of sports) {
    let added = 0;
    for (let k = 1; k <= LOOKBACK; k++) {
      const date = espnDate(new Date(now - k * DAY_S * 1000));
      if (await kvGet(doneKey(sport, date)).catch(() => null)) continue;
      const board = await kvGet<Board>(dayKey(sport, date)).catch(() => null);
      if (!board) continue;
      const entries = Object.values(board);
      const graded = await inBatches(entries, 6, async (e): Promise<BoardEntry> => {
        if (e.result) return e;
        const r = await gradeLegDetail({ player: e.player, stat: e.stat, line: e.line, side: "OVER", sport: e.sport, team: e.team, gameTime: e.gameTime, savedAt: e.gameTime }).catch(() => null);
        return r ? { ...e, result: r.result === "hit" ? "over" : r.result === "miss" ? "under" : "push" } : e;
      });
      const settled = graded.every((e) => e.result);
      if (!settled && k < LOOKBACK) {
        // Save progress and try again tomorrow.
        await kvSet(dayKey(sport, date), Object.fromEntries(graded.map((e) => [`${e.player.toLowerCase()}|${e.stat}`, e])), 7 * DAY_S);
        continue;
      }
      const keep = graded.filter((e) => e.result === "over" || e.result === "under");
      const archive = (await kvGet<BoardEntry[]>(gradedKey(sport)).catch(() => null)) ?? [];
      await kvSet(gradedKey(sport), [...keep, ...archive].slice(0, KEEP_GRADED), 400 * DAY_S);
      await kvSet(doneKey(sport, date), true, 30 * DAY_S);
      added += keep.length;
    }
    report[sport] = `${added} lines graded`;
  }
  return report;
}

/** Every graded board line kept, across sports. */
export async function gradedBoard(sports: Sport[]): Promise<BoardEntry[]> {
  const lists = await Promise.all(sports.map((s) => kvGet<BoardEntry[]>(gradedKey(s)).catch(() => null)));
  return lists.flatMap((l) => (Array.isArray(l) ? l : []));
}
