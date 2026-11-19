// Tuning the model on its own results. Every graded pick says how sure the model was and whether it hit, so
// the model can learn where it runs hot or cold: if its 60% overs in the NBA hit 54%, those chances should be
// pulled in. The fix is a two-number recalibration of the chance the over hits, per sport:
//
//   P(over) → sigmoid(a · logit(P(over)) + b)
//
// a below 1 means the model has been too sure of itself, above 1 not sure enough; b is a lean toward overs
// (positive) or unders. Both start at "change nothing" (a = 1, b = 0) and only move as graded picks pile up, and
// each sport starts from the all-sports fit, so a sport with a few dozen picks barely moves. Pure.
import type { GradedPick } from "./accuracy.ts";
import type { Blend } from "./boardLog.ts";
import type { Sport } from "./types.ts";

export interface Tune {
  a: number;
  b: number;
  /** Graded picks behind it. */
  n: number;
  /** Set on a sport's own fit. */
  sport?: Sport;
}

export interface Calibration {
  updatedAt: string;
  all: Tune;
  sports: Partial<Record<Sport, Tune>>;
  /** Per stat ("NBA:PTS"), once a stat has enough graded picks: points and rebounds don't miss the same way. */
  stats?: Record<string, Tune>;
  /** How much to trust the books over the model's own stats, learned from graded board lines ("NBA:sharp"). */
  blends?: Record<string, Blend>;
  /** Graded board lines behind the fits. */
  boardLines?: number;
}

/** How hard each number holds to its starting point, in the units of a pick's log-likelihood. About 200 picks move them halfway. */
const PRIOR_A = 8;
const PRIOR_B = 50;
const A_RANGE: [number, number] = [0.6, 1.4];
const B_RANGE: [number, number] = [-0.3, 0.3];
/** A sport needs this many graded picks for its own fit. */
const MIN_SPORT = 30;
/** A stat needs this many for its own fit, which starts from its sport's. */
const MIN_STAT = 40;

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (x: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, x));
const edge = (p: number) => clamp(p, [0.02, 0.98]);

/** A graded pick restated as "did the over hit?" with the model's chance of the over. */
const overFrame = (p: GradedPick) => ({
  x: logit(edge(p.side === "OVER" ? p.rawProb : 1 - p.rawProb)),
  y: p.hit === (p.side === "OVER") ? 1 : 0,
});

/** Penalized logistic fit of y on a·x + b, pulled toward (a0, b0). A few Newton steps converge. */
export function fitTune(picks: GradedPick[], a0 = 1, b0 = 0): Tune {
  const data = picks.map(overFrame);
  let a = a0;
  let b = b0;
  for (let it = 0; it < 25; it++) {
    let ga = -PRIOR_A * (a - a0);
    let gb = -PRIOR_B * (b - b0);
    let haa = PRIOR_A;
    let hab = 0;
    let hbb = PRIOR_B;
    for (const { x, y } of data) {
      const p = sigmoid(a * x + b);
      const w = p * (1 - p);
      ga += (y - p) * x;
      gb += y - p;
      haa += w * x * x;
      hab += w * x;
      hbb += w;
    }
    const det = haa * hbb - hab * hab;
    const da = (hbb * ga - hab * gb) / det;
    const db = (haa * gb - hab * ga) / det;
    a += da;
    b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-7) break;
  }
  return { a: clamp(a, A_RANGE), b: clamp(b, B_RANGE), n: data.length };
}

export function buildCalibration(picks: GradedPick[], now = new Date()): Calibration {
  const all = fitTune(picks);
  const sports: Calibration["sports"] = {};
  const bySport = new Map<Sport, GradedPick[]>();
  for (const p of picks) bySport.set(p.sport, [...(bySport.get(p.sport) ?? []), p]);
  for (const [sport, list] of bySport) if (list.length >= MIN_SPORT) sports[sport] = { ...fitTune(list, all.a, all.b), sport };
  const stats: Record<string, Tune> = {};
  const byStat = new Map<string, GradedPick[]>();
  for (const p of picks) if (p.stat) byStat.set(`${p.sport}:${p.stat}`, [...(byStat.get(`${p.sport}:${p.stat}`) ?? []), p]);
  for (const [key, list] of byStat) {
    if (list.length < MIN_STAT) continue;
    const from = sports[list[0].sport] ?? all;
    stats[key] = { ...fitTune(list, from.a, from.b), sport: list[0].sport };
  }
  return { updatedAt: now.toISOString(), all, sports, stats };
}

/** The tune for a stat or sport: the narrowest fit that has enough picks, else the all-sports one. */
export function tuneFor(cal: Calibration | null | undefined, sport: Sport, stat?: string): Tune | undefined {
  return cal ? (stat ? cal.stats?.[`${sport}:${stat}`] : undefined) ?? cal.sports[sport] ?? cal.all : undefined;
}

/** Recalibrated chance of the over (pushes left out of both). */
export function applyTune(pOverShare: number, tune: Tune | undefined): number {
  if (!tune || (tune.a === 1 && tune.b === 0)) return pOverShare;
  return sigmoid(tune.a * logit(edge(pOverShare)) + tune.b);
}

/** One line on what the tune is doing to this pick, or undefined when it's a rounding error. */
export function tuneReason(before: number, after: number, tune: Tune, pick: "OVER" | "UNDER"): string | undefined {
  const from = pick === "OVER" ? before : 1 - before;
  const to = pick === "OVER" ? after : 1 - after;
  if (Math.abs(to - from) < 0.005) return undefined;
  const why =
    Math.abs(tune.a - 1) * 2 >= Math.abs(tune.b)
      ? tune.a < 1 ? "has been a little too sure of itself" : "has been a little too cautious"
      : tune.b > 0 ? "has been picking too few overs" : "has been picking too few unders";
  return `Adjusted from ${(from * 100).toFixed(0)}% to ${(to * 100).toFixed(0)}%: in ${tune.n} past ${tune.sport ? `${tune.sport} ` : ""}picks we graded, the model ${why}`;
}
