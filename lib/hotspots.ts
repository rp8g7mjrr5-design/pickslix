// Your hot spots: the kinds of picks you personally hit ("68% on NBA rebound unders"), from your graded slips,
// so the board can point out tonight's lines that fit. Pure.
import type { SavedSlip } from "./storage.ts";
import { STATS, type Sport, type StatKey } from "./types.ts";

export interface Spot {
  sport: Sport;
  stat: StatKey;
  side: "OVER" | "UNDER";
  hits: number;
  n: number;
  rate: number;
  label: string;
}

/** Enough graded picks of a kind to say anything about it. */
export const SPOT_MIN = 8;
const HOT = 0.6;
const COLD = 0.4;

const plural = (label: string) => label.toLowerCase().replace(/s$/, "");

export const spotLabel = (sport: Sport, stat: StatKey, side: "OVER" | "UNDER") => `${sport} ${plural(STATS[stat].label)} ${side === "OVER" ? "overs" : "unders"}`;

export function hotSpots(slips: SavedSlip[]): { hot: Spot[]; cold: Spot[] } {
  const by = new Map<string, Spot>();
  for (const s of slips)
    for (const l of s.legs ?? []) {
      if (l.result !== "hit" && l.result !== "miss") continue;
      const sport = l.sport ?? STATS[l.stat]?.sport;
      if (!sport || !STATS[l.stat]) continue;
      const key = `${sport}|${l.stat}|${l.side}`;
      const spot = by.get(key) ?? { sport, stat: l.stat, side: l.side, hits: 0, n: 0, rate: 0, label: spotLabel(sport, l.stat, l.side) };
      spot.n++;
      if (l.result === "hit") spot.hits++;
      by.set(key, spot);
    }
  const spots = [...by.values()].filter((s) => s.n >= SPOT_MIN).map((s) => ({ ...s, rate: s.hits / s.n }));
  return {
    hot: spots.filter((s) => s.rate >= HOT).sort((a, b) => b.rate - a.rate || b.n - a.n),
    cold: spots.filter((s) => s.rate <= COLD).sort((a, b) => a.rate - b.rate || b.n - a.n),
  };
}

/** Tonight's lines that fit a hot spot and that the model also likes on the same side. */
export function spotLines<R extends { sport: Sport; stat: StatKey; pick: "OVER" | "UNDER"; pickProb: number }>(rows: R[], hot: Spot[], max = 3) {
  const out: { row: R; spot: Spot }[] = [];
  for (const r of [...rows].sort((a, b) => b.pickProb - a.pickProb)) {
    const spot = hot.find((s) => s.sport === r.sport && s.stat === r.stat && s.side === r.pick);
    if (spot && r.pickProb >= 0.53) out.push({ row: r, spot });
    if (out.length >= max) break;
  }
  return out;
}
