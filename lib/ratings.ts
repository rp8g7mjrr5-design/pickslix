// Team strength for game lines. Every team gets an attack and a defense rating fitted to this season's scores
// (recent games count more): points scored = league average + own attack − opponent's defense ± home edge. From two
// teams' ratings come expected scores, and from those the chance of each moneyline, spread and total side, using
// a normal margin for basketball and football and Poisson goals and runs for hockey and baseball. The books are far
// better at this than a ratings model, so the model only nudges their price (see blend). Pure.
import { sameTeam } from "./odds.ts";
import type { Sport } from "./types.ts";

export interface TeamRating {
  name: string;
  /** Points per game above average this team scores (attack) and holds opponents under (defense). */
  att: number;
  def: number;
  /** Weighted games behind the numbers. */
  n: number;
}

export interface Ratings {
  sport: Sport;
  updatedAt: string;
  /** Average points one team scores in a game. */
  mu: number;
  hfa: number;
  teams: Record<string, TeamRating>;
}

export interface Result {
  date: string;
  home: { abbr: string; name: string; score: number };
  away: { abbr: string; name: string; score: number };
  neutral?: boolean;
}

interface SportModel {
  /** Home edge in points, split between the two scores. */
  hfa: number;
  halfLifeDays: number;
  /** Ridge prior, in weighted games: early-season ratings stay near average. */
  prior: number;
  /** Margin and total spread for the normal model; absent for count sports. */
  sdMargin?: number;
  sdTotal?: number;
}

export const SPORT_MODEL: Partial<Record<Sport, SportModel>> = {
  NBA: { hfa: 2.5, halfLifeDays: 30, prior: 4, sdMargin: 12, sdTotal: 18 },
  CBB: { hfa: 3, halfLifeDays: 30, prior: 4, sdMargin: 10.5, sdTotal: 14 },
  NFL: { hfa: 1.8, halfLifeDays: 60, prior: 2, sdMargin: 13.5, sdTotal: 13 },
  CFB: { hfa: 2.5, halfLifeDays: 60, prior: 2, sdMargin: 15.5, sdTotal: 16 },
  NHL: { hfa: 0.15, halfLifeDays: 40, prior: 8 },
  MLB: { hfa: 0.12, halfLifeDays: 45, prior: 10 },
};

/** Fit attack and defense by alternating weighted ridge updates (converges in a few dozen passes). */
export function fitRatings(sport: Sport, results: Result[], now = Date.now()): Ratings | null {
  const m = SPORT_MODEL[sport];
  if (!m || !results.length) return null;
  const lambda = Math.LN2 / m.halfLifeDays;
  const games = results.map((r) => ({ ...r, w: Math.exp(-lambda * Math.max(0, (now - Date.parse(r.date)) / 86400_000)), edge: r.neutral ? 0 : m.hfa / 2 }));
  const wsum = games.reduce((a, g) => a + g.w, 0);
  const mu = games.reduce((a, g) => a + g.w * (g.home.score + g.away.score), 0) / (2 * wsum);
  const teams: Record<string, TeamRating> = {};
  for (const g of games)
    for (const t of [g.home, g.away]) {
      teams[t.abbr] ??= { name: t.name, att: 0, def: 0, n: 0 };
      teams[t.abbr].n += g.w;
    }
  // Each game gives two rows: home scoring on away, away scoring on home.
  const rows = games.flatMap((g) => [
    { off: g.home.abbr, dfn: g.away.abbr, pts: g.home.score, edge: g.edge, w: g.w },
    { off: g.away.abbr, dfn: g.home.abbr, pts: g.away.score, edge: -g.edge, w: g.w },
  ]);
  for (let pass = 0; pass < 40; pass++) {
    const attNum: Record<string, number> = {};
    const defNum: Record<string, number> = {};
    const den: Record<string, number> = {};
    for (const r of rows) {
      attNum[r.off] = (attNum[r.off] ?? 0) + r.w * (r.pts - mu - r.edge + teams[r.dfn].def);
      defNum[r.dfn] = (defNum[r.dfn] ?? 0) + r.w * (mu + r.edge + teams[r.off].att - r.pts);
      den[r.off] = (den[r.off] ?? 0) + r.w;
    }
    for (const [abbr, t] of Object.entries(teams)) {
      t.att = (attNum[abbr] ?? 0) / ((den[abbr] ?? 0) + m.prior);
      t.def = (defNum[abbr] ?? 0) / ((den[abbr] ?? 0) + m.prior);
    }
  }
  return { sport, updatedAt: new Date(now).toISOString(), mu, hfa: m.hfa, teams };
}

/** The rated team an odds feed's full name ("Boston Celtics") refers to. */
export function findTeam(r: Ratings, oddsName: string): TeamRating | undefined {
  const hits = Object.values(r.teams).filter((t) => sameTeam(oddsName, t.name));
  // "Miami" matches the Dolphins only by city; prefer the longest (most specific) name.
  return hits.sort((a, b) => b.name.length - a.name.length)[0];
}

export interface Prediction {
  home: number;
  away: number;
  /** Fewest weighted games either team has; the model's say shrinks below a handful. */
  games: number;
}

export function predict(r: Ratings, homeName: string, awayName: string, neutral = false): Prediction | undefined {
  const h = findTeam(r, homeName);
  const a = findTeam(r, awayName);
  if (!h || !a || h === a) return undefined;
  const edge = neutral ? 0 : r.hfa / 2;
  return {
    home: Math.max(0.1, r.mu + h.att - a.def + edge),
    away: Math.max(0.1, r.mu + a.att - h.def - edge),
    games: Math.min(h.n, a.n),
  };
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, good to about 1e-7). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

const poisson = (lam: number, max: number) => {
  const out = [Math.exp(-lam)];
  for (let k = 1; k <= max; k++) out.push((out[k - 1] * lam) / k);
  return out;
};

/** Joint chance over (home, away) scores for count sports, as a function of a predicate. */
function countChance(p: Prediction, test: (h: number, a: number) => number): number {
  const max = Math.ceil(Math.max(p.home, p.away) * 3 + 12);
  const ph = poisson(p.home, max);
  const pa = poisson(p.away, max);
  let s = 0;
  for (let h = 0; h <= max; h++) for (let a = 0; a <= max; a++) s += ph[h] * pa[a] * test(h, a);
  return s;
}

/**
 * The model's chance for one side of a game market, pushes left out. `side` is "home", "away", "over" or "under";
 * `point` is that side's spread (home −5.5) or the total.
 */
export function sideChance(sport: Sport, p: Prediction, key: "h2h" | "spreads" | "totals", side: "home" | "away" | "over" | "under", point = 0): number {
  const m = SPORT_MODEL[sport];
  if (!m) return NaN;
  const flip = side === "away" || side === "under";
  let homeOrOver: number;
  if (m.sdMargin && m.sdTotal) {
    const margin = p.home - p.away;
    const total = p.home + p.away;
    if (key === "h2h") homeOrOver = normCdf(margin / m.sdMargin);
    else if (key === "spreads") {
      // The home side's spread: away +3.5 is home −3.5.
      const hs = side === "home" ? point : -point;
      homeOrOver = normCdf((margin + hs) / m.sdMargin);
    } else homeOrOver = normCdf((total - point) / m.sdTotal);
  } else {
    // Hockey and baseball: ties after regulation go to overtime or extras, about a coin flip.
    if (key === "h2h") homeOrOver = countChance(p, (h, a) => (h > a ? 1 : h === a ? 0.5 : 0));
    else if (key === "spreads") {
      const hs = side === "home" ? point : -point;
      const win = countChance(p, (h, a) => (h + hs > a ? 1 : 0));
      const push = countChance(p, (h, a) => (h + hs === a ? 1 : 0));
      homeOrOver = win / Math.max(1 - push, 1e-9);
    } else {
      const over = countChance(p, (h, a) => (h + a > point ? 1 : 0));
      const push = countChance(p, (h, a) => (h + a === point ? 1 : 0));
      homeOrOver = over / Math.max(1 - push, 1e-9);
    }
  }
  return flip ? 1 - homeOrOver : homeOrOver;
}

/** How much the model moves the books' fair price, at most: a ratings model knows less than the market. */
const MODEL_WEIGHT: Partial<Record<Sport, number>> = { CFB: 0.35, CBB: 0.35 };
const DEFAULT_WEIGHT = 0.25;
/** Weighted games each team needs before the model gets its full say. */
const FULL_GAMES = 8;

/** The market's fair chance moved part of the way toward the model's. */
export function blend(sport: Sport, fair: number, model: number, games: number): number {
  if (!Number.isFinite(model)) return fair;
  const w = (MODEL_WEIGHT[sport] ?? DEFAULT_WEIGHT) * Math.min(1, games / FULL_GAMES);
  return fair + w * (model - fair);
}
