// The post-game recap: one line that sums up a settled slip, for the share card ("4 of 5 hit. Morant missed by
// 1.5."). Pure.
import { STATS, type StatKey } from "./types.ts";

export interface RecapLeg {
  player: string;
  stat: StatKey;
  line: number;
  side: "OVER" | "UNDER";
  result?: "hit" | "miss" | "push";
  /** What the player put up, when we graded it from the box score. */
  actual?: number;
}

const last = (name: string) => name.trim().split(/\s+/).slice(-1)[0] ?? name;
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** Every leg has a result. */
export const settled = (legs: RecapLeg[]) => legs.length > 0 && legs.every((l) => l.result);

/** How far a leg cleared or missed its line, when we know what the player put up. */
export const margin = (l: RecapLeg) => (l.actual === undefined ? undefined : l.side === "OVER" ? l.actual - l.line : l.line - l.actual);

export function recapLine(legs: RecapLeg[]): string {
  const hits = legs.filter((l) => l.result === "hit").length;
  const misses = legs.filter((l) => l.result === "miss");
  const pushes = legs.filter((l) => l.result === "push").length;
  const counted = legs.length - pushes;
  if (!counted) return "All pushed.";
  const head = hits === counted ? (counted === 1 ? "1 for 1." : `All ${counted} hit.`) : `${hits} of ${counted} hit.`;
  const push = pushes ? ` ${pushes} push${pushes === 1 ? "" : "es"}.` : "";
  if (!misses.length) {
    // Brag about the closest call, if one was close.
    const sweat = legs
      .filter((l) => l.result === "hit" && margin(l) !== undefined)
      .sort((a, b) => margin(a)! - margin(b)!)[0];
    return sweat && margin(sweat)! <= 1.5 ? `${head}${push} ${last(sweat.player)} cleared by ${fmt(margin(sweat)!)}.` : `${head}${push}`;
  }
  // The heartbreaker: the miss that came closest.
  const near = misses.filter((l) => margin(l) !== undefined).sort((a, b) => margin(b)! - margin(a)!)[0];
  if (near) return `${head}${push} ${last(near.player)} missed by ${fmt(-margin(near)!)}.`;
  return `${head}${push}`;
}

/** "Tatum 31 PTS (27.5)" style detail for a leg on the card. */
export const legDetail = (l: RecapLeg) =>
  l.actual !== undefined ? `${fmt(l.actual)} ${STATS[l.stat]?.label.toLowerCase() ?? l.stat} (line ${l.line})` : `${l.line} ${STATS[l.stat]?.label ?? l.stat}`;
