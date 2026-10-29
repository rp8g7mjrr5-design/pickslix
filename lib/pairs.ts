// Correlation builder: lines from today's slate that rise and fall with what's already on your slip, like a QB's
// passing yards with his top receiver's. Picks that move together lift a slip's real chance of hitting. Pure.
import { legCorrelation, type CorrLeg } from "./correlation.ts";
import type { LiteRow } from "./slateLite.ts";

export interface Pair {
  row: LiteRow;
  side: "OVER" | "UNDER";
  prob: number;
  /** The slip leg it moves with most. */
  with: string;
  corr: number;
}

/** Linked at least this much to count as a pair. */
const MIN_CORR = 0.2;
/** The suggested side has to be one the model likes. */
const MIN_PROB = 0.55;

export function suggestPairs(legs: (CorrLeg & { propId?: string })[], rows: LiteRow[], max = 3): Pair[] {
  if (!legs.length) return [];
  const taken = new Set(legs.map((l) => `${l.player.toLowerCase()}|${l.stat}`));
  const out: Pair[] = [];
  for (const r of rows) {
    if (taken.has(`${r.player.toLowerCase()}|${r.stat}`) || r.pickProb < MIN_PROB) continue;
    const cand: CorrLeg = { player: r.player, stat: r.stat, side: r.pick, prob: r.pickProb, sport: r.sport, team: r.team, opponent: r.opponent };
    const links = legs.map((l) => ({ l, c: legCorrelation(l, cand) }));
    // Anything that fights another pick on the slip is out.
    if (links.some((x) => x.c < 0)) continue;
    const best = links.sort((a, b) => b.c - a.c)[0];
    if (best.c < MIN_CORR) continue;
    out.push({ row: r, side: r.pick, prob: r.pickProb, with: best.l.player, corr: best.c });
  }
  return out.sort((a, b) => b.corr - a.corr || b.prob - a.prob).slice(0, max);
}
