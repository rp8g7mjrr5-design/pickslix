// Closing-line value: did the sportsbooks move toward your pick before the game started? Books sharpen their
// prices right up to the start, so beating the closing price is the best sign a pick was good, win or lose.
// Prices are compared at the Pick 6 line: each one (which may be at another line) is turned into a chance for
// your side at your line with the same spread-to-mean ratio the model used for the player. Pure.
import { impliedMean, overUnder } from "./model.ts";
import type { SavedSlip, SlipLeg } from "./storage.ts";

/** A sportsbook consensus price: no-vig chance of the over at their line. */
export interface Price {
  line: number;
  pOver: number;
}

/** The books' chance for `side` at `line`, pushes left out. */
export function sideChance(price: Price, line: number, side: "OVER" | "UNDER", dispersion: number): number {
  if (price.line === line) return side === "OVER" ? price.pOver : 1 - price.pOver;
  const mean = impliedMean({ line: price.line, pOver: price.pOver }, dispersion);
  const { pOver, pUnder } = overUnder(mean, mean * dispersion, line);
  const over = pOver / Math.max(pOver + pUnder, 1e-9);
  return side === "OVER" ? over : 1 - over;
}

/** Points the close moved toward (positive) or away from this leg's side; undefined without both prices. */
export function legClv(l: SlipLeg): { open: number; close: number; diff: number } | undefined {
  if (!l.openPrice || !l.closePrice) return undefined;
  const d = l.dispersion && l.dispersion > 0 ? l.dispersion : 1.2;
  const open = sideChance(l.openPrice, l.line, l.side, d);
  const close = sideChance(l.closePrice, l.line, l.side, d);
  return { open, close, diff: close - open };
}

export interface ClvSummary {
  n: number;
  /** Legs where the close moved toward the pick (by at least half a point). */
  beat: number;
  /** Moved away by at least half a point. */
  lost: number;
  /** Average move toward the pick, in chance (0.02 = 2 points). */
  avg: number;
}

export function clvSummary(slips: SavedSlip[]): ClvSummary {
  const diffs = slips.flatMap((s) => s.legs.map(legClv)).filter((x): x is NonNullable<typeof x> => Boolean(x)).map((x) => x.diff);
  return {
    n: diffs.length,
    beat: diffs.filter((d) => d >= 0.005).length,
    lost: diffs.filter((d) => d <= -0.005).length,
    avg: diffs.length ? diffs.reduce((a, d) => a + d, 0) / diffs.length : 0,
  };
}

/** The key a game's last-seen prices are kept under: sport and the UTC day it starts. */
export const closeKey = (sport: string, isoStart: string) => `odds:close:${sport}:${isoStart.slice(0, 10)}`;
/** One prop within that day's prices. */
export const closeField = (normPlayer: string, stat: string) => `${normPlayer}|${stat}`;
