// The public model report card: every pick anyone saved, graded from the box score, bucketed by the chance the
// model gave it. Same counting rules as the leaderboard (graded automatically, saved before the game started),
// and each distinct pick counts once however many people played it, so a popular tail can't swamp the numbers.
import type { SavedSlip } from "./storage.ts";
import { STATS, type Sport } from "./types.ts";

export const BUCKETS: [number, number, string][] = [
  [0, 0.55, "Under 55%"],
  [0.55, 0.6, "55–60%"],
  [0.6, 0.65, "60–65%"],
  [0.65, 1.01, "65%+"],
];

export interface Bucket {
  label: string;
  n: number;
  hits: number;
  /** Average chance the model gave these picks. */
  expected: number;
}

export interface AccuracyReport {
  picks: number;
  hits: number;
  /** Mean squared error of the model's chance against what happened: 0.25 is a coin flip, lower is better. */
  brier: number | null;
  buckets: Bucket[];
  bySport: { sport: Sport; n: number; hits: number; expected: number }[];
  since?: string;
}

export function accuracyReport(slips: SavedSlip[]): AccuracyReport {
  const seen = new Map<string, { prob: number; hit: boolean; sport: Sport; date: string }>();
  for (const s of slips) {
    if (!Array.isArray(s?.legs)) continue;
    for (const l of s.legs) {
      if (!l.auto || !l.result || l.result === "push" || !l.gameTime) continue;
      if (!(Date.parse(s.createdAt) < Date.parse(l.gameTime))) continue;
      if (!(l.prob > 0 && l.prob < 1) || !(l.stat in STATS)) continue;
      const key = `${l.player.toLowerCase()}|${l.stat}|${l.line}|${l.side}|${l.gameTime.slice(0, 10)}`;
      // First save wins: that's the chance shown before anyone else piled on.
      if (!seen.has(key)) seen.set(key, { prob: l.prob, hit: l.result === "hit", sport: l.sport ?? STATS[l.stat].sport, date: l.gameTime });
    }
  }
  const all = [...seen.values()];
  const buckets = BUCKETS.map(([lo, hi, label]) => {
    const inB = all.filter((p) => p.prob >= lo && p.prob < hi);
    return {
      label,
      n: inB.length,
      hits: inB.filter((p) => p.hit).length,
      expected: inB.length ? inB.reduce((a, p) => a + p.prob, 0) / inB.length : 0,
    };
  });
  const sports = new Map<Sport, { n: number; hits: number; prob: number }>();
  for (const p of all) {
    const e = sports.get(p.sport) ?? { n: 0, hits: 0, prob: 0 };
    e.n++;
    e.hits += p.hit ? 1 : 0;
    e.prob += p.prob;
    sports.set(p.sport, e);
  }
  return {
    picks: all.length,
    hits: all.filter((p) => p.hit).length,
    brier: all.length ? all.reduce((a, p) => a + (p.prob - (p.hit ? 1 : 0)) ** 2, 0) / all.length : null,
    buckets,
    bySport: [...sports.entries()].map(([sport, e]) => ({ sport, n: e.n, hits: e.hits, expected: e.prob / e.n })).sort((a, b) => b.n - a.n),
    since: all.map((p) => p.date).sort()[0],
  };
}
