// The soft-line track record: every soft line we flagged, graded from the box score, so Pro is sold on results
// rather than on faith. Pure: storage and grading are in softLog.ts.
import type { Edge } from "./edges.ts";

/** One flagged soft line, as first seen that day, and how it went. */
export type SoftEntry = Pick<Edge, "sport" | "player" | "team" | "opponent" | "stat" | "line" | "side" | "gameTime" | "booksProb"> & {
  /** When we first flagged it. */
  at: string;
  result?: "hit" | "miss" | "push";
};

export interface SoftRecord {
  hits: number;
  misses: number;
  pushes: number;
  /** Hits over hits plus misses; null until there's anything graded. */
  rate: number | null;
  /** How many days of flags this covers. */
  days: number;
  /** The latest graded ones, newest first. */
  recent: SoftEntry[];
}

/** Below this many graded lines the record is too thin to show off. */
export const MIN_GRADED = 10;

/** One flag per player, stat and day: a line that stays soft for hours (or moves half a point) counts once. */
export const softKey = (e: Pick<Edge, "player" | "stat" | "gameTime">) => `${e.player}|${e.stat}|${e.gameTime.slice(0, 10)}`.toLowerCase();

/** Add today's new soft lines to the day's log. Returns the log, or null when nothing was new. */
export function addFlags(log: Record<string, SoftEntry>, edges: Edge[], now: number): Record<string, SoftEntry> | null {
  let changed = false;
  const next = { ...log };
  for (const e of edges) {
    if (e.kind !== "soft") continue;
    const k = softKey(e);
    if (next[k]) continue;
    const { sport, player, team, opponent, stat, line, side, gameTime, booksProb } = e;
    next[k] = { sport, player, team, opponent, stat, line, side, gameTime, booksProb, at: new Date(now).toISOString() };
    changed = true;
  }
  return changed ? next : null;
}

export function softRecord(days: SoftEntry[][]): SoftRecord {
  const all = days.flat();
  const graded = all.filter((e) => e.result).sort((a, b) => b.gameTime.localeCompare(a.gameTime));
  const hits = graded.filter((e) => e.result === "hit").length;
  const misses = graded.filter((e) => e.result === "miss").length;
  const pushes = graded.length - hits - misses;
  return {
    hits,
    misses,
    pushes,
    rate: hits + misses ? hits / (hits + misses) : null,
    days: days.filter((d) => d.length).length,
    recent: graded.slice(0, 5),
  };
}

