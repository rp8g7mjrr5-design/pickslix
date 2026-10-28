// Settles saved picks from ESPN box scores (the player's game log), so the tracker grades itself.
import { fetchGameLogs, findAthlete } from "./espn.ts";
import { statValue } from "./model.ts";
import type { GameLog, Sport, StatKey } from "./types.ts";
import { STATS } from "./types.ts";

export type Result = "hit" | "miss" | "push";

export interface GradeInput {
  player: string;
  stat: StatKey;
  line: number;
  side: "OVER" | "UNDER";
  sport?: Sport;
  team?: string;
  /** Scheduled start, when the pick came from a known game. */
  gameTime?: string;
  /** When the slip was saved; used to find the game when there's no gameTime. */
  savedAt: string;
}

const DAY = 86400_000;
/** How long after the start we wait before calling a missing box score a did-not-play. */
const FINAL_AFTER = 6 * 3600_000;

export function resultFor(value: number, line: number, side: "OVER" | "UNDER"): Result {
  if (value === line) return "push";
  return (value > line) === (side === "OVER") ? "hit" : "miss";
}

/**
 * Find the game the pick was for and grade it. null means not settled yet.
 * A player with no box score well after the game counts as a push, the way Pick 6 voids a pick for a player who sits.
 */
export function gradeFromLogs(input: GradeInput, logs: GameLog[], now = Date.now()): Result | null {
  return gradeDetail(input, logs, now)?.result ?? null;
}

/** The grade and, when the player played, what they put up. */
export function gradeDetail(input: GradeInput, logs: GameLog[], now = Date.now()): { result: Result; value?: number } | null {
  const start = Date.parse(input.gameTime ?? input.savedAt);
  if (!Number.isFinite(start)) return null;
  // Log dates are UTC calendar days, like the ISO times we store.
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const window = input.gameTime ? [day(start - DAY / 2), day(start + DAY / 2)] : [day(start), day(start + 3 * DAY)];
  const game = logs
    .filter((g) => g.date >= window[0] && g.date <= window[1])
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (game) {
    if (game.playing <= 0) return { result: "push" };
    const value = statValue(game, input.stat);
    return { result: resultFor(value, input.line, input.side), value };
  }
  const deadline = input.gameTime ? start + FINAL_AFTER : start + 3 * DAY + FINAL_AFTER;
  return now > deadline ? { result: "push" } : null;
}

export async function gradeLeg(input: GradeInput): Promise<Result | null> {
  return (await gradeLegDetail(input))?.result ?? null;
}

export async function gradeLegDetail(input: GradeInput): Promise<{ result: Result; value?: number } | null> {
  const start = Date.parse(input.gameTime ?? input.savedAt);
  // Nothing to look up until the game has had time to finish.
  if (!Number.isFinite(start) || Date.now() < start + 3 * 3600_000) return null;
  const sport = input.sport ?? STATS[input.stat].sport;
  const athlete = await findAthlete(input.player, sport, input.team ? [input.team] : []);
  if (!athlete) return null;
  const logs = await fetchGameLogs(athlete.id, sport, 0);
  return gradeDetail(input, logs);
}
