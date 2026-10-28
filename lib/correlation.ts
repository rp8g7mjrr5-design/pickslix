// Picks from the same game move together: a QB's passing yards and his receiver's, two skaters on a line, a
// player's points and his PRA. Multiplying leg chances assumes they don't, which undercounts slips built on one
// game script (overs with overs) and overcounts slips that fight themselves (an over and an under on linked stats).
// Each pair of legs gets an estimated correlation; the slip's chance is then simulated with a Gaussian copula.
// The correlations are rough, published-research-sized estimates, not fitted to our own data yet.
import type { Sport, StatKey } from "./types.ts";

export interface CorrLeg {
  player: string;
  stat: StatKey;
  side: "OVER" | "UNDER";
  prob: number;
  sport?: Sport;
  team?: string;
  opponent?: string;
}

const PASSING: StatKey[] = ["PASS_YDS", "PASS_TD", "PASS_ATT"];
const RECEIVING: StatKey[] = ["REC", "REC_YDS", "RUSH_REC_YDS"];
const NHL_SCORING: StatKey[] = ["GOALS", "NHL_AST", "NHL_PTS"];
const MLB_HITTING: StatKey[] = ["HITS", "TB", "HRR", "RUNS", "RBI"];
const MLB_PITCHING: StatKey[] = ["K", "HITS_ALLOWED", "OUTS"];

/** Stats built from the same box-score fields (PTS inside PRA) move almost together. */
const PARTS: Partial<Record<StatKey, string[]>> = {
  PTS: ["pts"], REB: ["reb"], AST: ["ast"], "3PM": ["fg3m", "pts"], PRA: ["pts", "reb", "ast"], PR: ["pts", "reb"], PA: ["pts", "ast"], RA: ["reb", "ast"],
  PASS_YDS: ["passYds"], PASS_TD: ["passYds"], PASS_ATT: ["passYds"], RUSH_YDS: ["rushYds"], REC: ["recYds"], REC_YDS: ["recYds"],
  RUSH_REC_YDS: ["rushYds", "recYds"], SOG: ["shots"], GOALS: ["goals"], NHL_AST: ["assists"], NHL_PTS: ["goals", "assists"],
  HITS: ["hits"], TB: ["hits"], HRR: ["hits", "runs", "rbi"], RUNS: ["runs"], RBI: ["rbi"],
};

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const both = (a: StatKey, b: StatKey, x: StatKey[], y: StatKey[]) => (x.includes(a) && y.includes(b)) || (x.includes(b) && y.includes(a));

/** Correlation between the two stats themselves (over = high), before which side was picked. */
export function statCorrelation(a: CorrLeg, b: CorrLeg): number {
  if (a.sport && b.sport && a.sport !== b.sport) return 0;
  if (sameName(a.player, b.player)) {
    const pa = PARTS[a.stat] ?? [];
    const pb = PARTS[b.stat] ?? [];
    return pa.some((f) => pb.includes(f)) ? 0.75 : 0.25;
  }
  if (!a.team || !b.team) return 0;
  const sport = a.sport ?? b.sport;
  if (a.team === b.team) {
    if (sport === "NFL") {
      if (both(a.stat, b.stat, PASSING, RECEIVING)) return 0.45;
      if (both(a.stat, b.stat, PASSING, ["RUSH_YDS"])) return -0.1;
      return 0.05;
    }
    if (sport === "NHL") return NHL_SCORING.includes(a.stat) && NHL_SCORING.includes(b.stat) ? 0.25 : 0.1;
    if (sport === "MLB") return MLB_HITTING.includes(a.stat) && MLB_HITTING.includes(b.stat) ? 0.2 : 0;
    // NBA teammates share possessions: one's big night is a little less of the other's.
    return -0.05;
  }
  if (a.opponent && a.opponent === b.team) {
    // Same game, other side: shootouts lift both offenses.
    if (sport === "NHL" && both(a.stat, b.stat, ["SAVES"], ["SOG"])) return 0.45;
    if (sport === "MLB" && both(a.stat, b.stat, ["HITS_ALLOWED"], ["HITS", "TB", "HRR"])) return 0.4;
    if (sport === "MLB" && both(a.stat, b.stat, ["K", "OUTS"], MLB_HITTING)) return -0.25;
    if (sport === "MLB" && (MLB_PITCHING.includes(a.stat) || MLB_PITCHING.includes(b.stat))) return 0;
    return 0.1;
  }
  return 0;
}

/** Correlation between the two legs hitting: an over and an under on linked stats pull apart. */
export const legCorrelation = (a: CorrLeg, b: CorrLeg) => statCorrelation(a, b) * (a.side === b.side ? 1 : -1);

/** Inverse standard normal CDF (Acklam's approximation, good to about 1e-9). */
export function normInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  if (q < 0.02425) {
    const r = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  if (q > 1 - 0.02425) return -normInv(1 - q);
  const r = q - 0.5;
  const s = r * r;
  return ((((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r) / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}

/** Lower-triangular L with L·Lᵀ = m, or null when m isn't positive definite. */
function cholesky(m: number[][]): number[][] | null {
  const n = m.length;
  const l = m.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = m[i][j];
      for (let k = 0; k < j; k++) sum -= l[i][k] * l[j][k];
      if (i === j) {
        if (sum <= 1e-9) return null;
        l[i][i] = Math.sqrt(sum);
      } else l[i][j] = sum / l[j][j];
    }
  }
  return l;
}

/** Small seeded generator, so the same slip always shows the same number. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLES = 40000;

/**
 * Chance every leg hits, allowing for same-game correlation. Equals the plain product when no two legs are linked.
 * `linked` lists the pairs (by index) that moved the number, for the slip to explain.
 */
export function correlatedHitProbability(legs: CorrLeg[]): { prob: number; independent: number; linked: [number, number][] } {
  const independent = legs.reduce((a, l) => a * l.prob, 1);
  const n = legs.length;
  const corr = legs.map((a, i) => legs.map((b, j) => (i === j ? 1 : legCorrelation(a, b))));
  const linked: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.abs(corr[i][j]) >= 0.1) linked.push([i, j]);
  if (!linked.length) return { prob: independent, independent, linked };

  // Shrink toward independence until the matrix is valid (a set of pairwise guesses needn't be).
  let l: number[][] | null = null;
  for (let shrink = 1; shrink >= 0 && !l; shrink -= 0.1) {
    l = cholesky(corr.map((row, i) => row.map((v, j) => (i === j ? 1 : v * shrink))));
  }
  if (!l) return { prob: independent, independent, linked: [] };

  const cut = legs.map((leg) => normInv(leg.prob));
  const rand = mulberry32(n * 7919 + Math.round(independent * 1e6));
  const z = new Array<number>(n);
  let hits = 0;
  for (let s = 0; s < SAMPLES; s++) {
    for (let i = 0; i < n; i += 2) {
      // Box-Muller: two normals per pair of uniforms.
      const u = Math.max(rand(), 1e-12);
      const v = rand();
      const r = Math.sqrt(-2 * Math.log(u));
      z[i] = r * Math.cos(2 * Math.PI * v);
      if (i + 1 < n) z[i + 1] = r * Math.sin(2 * Math.PI * v);
    }
    let all = true;
    for (let i = 0; i < n && all; i++) {
      let x = 0;
      for (let k = 0; k <= i; k++) x += l[i][k] * z[k];
      if (x > cut[i]) all = false;
    }
    if (all) hits++;
  }
  return { prob: hits / SAMPLES, independent, linked };
}
