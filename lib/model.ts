import { envFactor } from "./environment.ts";
import { sameName } from "./names.ts";
import type { TeamEnv } from "./odds.ts";
import { STATS } from "./types.ts";
import type {
  DefenseFactors,
  GameLog,
  NewsItem,
  Projection,
  Prop,
  Sport,
  StatKey,
} from "./types.ts";

/** Half-life in games for recency weighting: in NBA a game 6 back counts half as much as last night. */
const HALF_LIFE_GAMES: Record<Sport, number> = { NBA: 6, NFL: 4, MLB: 10, NHL: 8 };
/** How far we trust a defense factor (0 = ignore, 1 = take it at face value). */
const DEFENSE_SHRINK = 0.6;
const MAX_GAMES = 25;
/** Last season's games count this much as this season's (on top of recency): rosters and roles change over the summer. */
const PRIOR_WEIGHT = 0.35;
/** With fewer games than this from this season, the projection is flagged as early and capped at medium confidence. */
const EARLY_GAMES = 5;
/**
 * Pick 6 lines already price in a lot of information, so the projection is
 * pulled this far toward the line. 0 trusts the model fully.
 */
const LINE_WEIGHT = 0.3;
/**
 * When sportsbooks have priced the prop, the projection is pulled this far toward the mean their price implies
 * instead. Books carry real money and injury news the model can't see, so they get more say than a bare line.
 */
const MARKET_WEIGHT = 0.5;

export function statValue(g: GameLog, stat: StatKey): number {
  return STATS[stat].parts.reduce((sum, f) => sum + (g.stats[f] ?? 0), 0);
}

/** Exponentially weighted mean and variance; logs are newest first. `scale` down-weights single games (e.g. last season's). */
export function weightedStats(values: number[], halfLife = 6, scale?: number[]): { mean: number; variance: number; n: number } {
  const decay = Math.pow(0.5, 1 / halfLife);
  const weight = (i: number) => Math.pow(decay, i) * (scale?.[i] ?? 1);
  let wSum = 0;
  let mean = 0;
  values.forEach((v, i) => {
    const w = weight(i);
    wSum += w;
    mean += w * v;
  });
  mean /= wSum || 1;
  let variance = 0;
  values.forEach((v, i) => {
    variance += weight(i) * (v - mean) ** 2;
  });
  variance /= wSum || 1;
  // Small samples understate spread; inflate a little.
  const n = values.length;
  if (n > 1) variance *= n / (n - 1);
  return { mean, variance, n };
}

function logGamma(x: number): number {
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * PMF of the count distribution with the given mean and variance.
 * Uses a negative binomial when the data is overdispersed (the usual case
 * for player stats) and Poisson otherwise.
 */
export function countPmf(mean: number, variance: number, k: number): number {
  if (mean <= 0) return k === 0 ? 1 : 0;
  if (variance <= mean * 1.02) {
    return Math.exp(k * Math.log(mean) - mean - logGamma(k + 1));
  }
  const r = (mean * mean) / (variance - mean);
  const p = r / (r + mean);
  return Math.exp(
    logGamma(k + r) - logGamma(r) - logGamma(k + 1) + r * Math.log(p) + k * Math.log(1 - p),
  );
}

/** P(X > line), P(X = line), P(X < line) for an integer-valued stat. */
export function overUnder(mean: number, variance: number, line: number) {
  const upper = Math.ceil(mean + 12 * Math.sqrt(Math.max(variance, mean, 1)) + 10);
  let below = 0;
  let push = 0;
  for (let k = 0; k <= upper; k++) {
    const pk = countPmf(mean, variance, k);
    if (k < line) below += pk;
    else if (k === line) push += pk;
  }
  below = Math.min(below, 1);
  const over = Math.max(0, 1 - below - push);
  return { pOver: over, pPush: push, pUnder: below };
}

/** Sportsbook no-vig price for the over at `line` (which may differ from the Pick 6 line). */
export interface MarketInput {
  line: number;
  pOver: number;
  books?: number;
  sharp?: boolean;
}

export interface ModelInput {
  prop: Prop;
  logs: GameLog[];
  defense: DefenseFactors;
  news: NewsItem[];
  market?: MarketInput;
  /** The game's spread and total from this team's side. */
  env?: TeamEnv;
}

/** P(over) with pushes left out, the way a de-vigged book price reads. */
const overShare = (mean: number, variance: number, line: number) => {
  const { pOver, pUnder } = overUnder(mean, variance, line);
  return pOver / Math.max(pOver + pUnder, 1e-9);
};

/**
 * The mean the books' price implies: the mean at which our distribution (same spread-to-mean ratio as the
 * player's) gives their no-vig P(over) at their line. Found by bisection; P(over) rises with the mean.
 */
export function impliedMean(market: MarketInput, dispersion: number): number {
  const p = Math.min(0.97, Math.max(0.03, market.pOver));
  let lo = 0.01;
  let hi = Math.max(1, market.line) * 4 + 10;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (overShare(mid, mid * dispersion, market.line) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(0)}%`;

export function project({ prop, logs, defense, news, market, env }: ModelInput): Projection {
  const reasons: string[] = [];
  const recentLogs = logs.slice(0, MAX_GAMES).filter((g) => g.playing > 0);
  const values = recentLogs.map((g) => statValue(g, prop.stat));
  if (values.length === 0) {
    return {
      propId: prop.id,
      mean: prop.line,
      pOver: 0.5,
      pUnder: 0.5,
      pPush: 0,
      pick: "OVER",
      pickProb: 0.5,
      edge: 0,
      confidence: "low",
      sampleSize: 0,
      hitRateLast10: 0,
      reasons: ["No game logs found for this player yet"],
      status: "ok",
    };
  }
  const scale = recentLogs.map((g) => (g.prior ? PRIOR_WEIGHT : 1));
  const thisSeason = recentLogs.filter((g) => !g.prior).length;
  const base = weightedStats(values, HALF_LIFE_GAMES[prop.sport], scale);
  let mean = base.mean;
  let variance = base.variance;
  reasons.push(
    thisSeason === base.n
      ? `Recency-weighted average ${base.mean.toFixed(1)} over last ${base.n} games vs line ${prop.line}`
      : `Recency-weighted average ${base.mean.toFixed(1)} vs line ${prop.line}: ${thisSeason} game${thisSeason === 1 ? "" : "s"} this season, plus ${base.n - thisSeason} from last season counted for less`,
  );

  // Matchup
  const raw = defense[prop.opponent]?.[prop.stat];
  if (raw && raw !== 1) {
    const factor = 1 + (raw - 1) * DEFENSE_SHRINK;
    mean *= factor;
    variance *= factor * factor;
    const rank = raw > 1 ? "soft" : "tough";
    reasons.push(`${prop.opponent} is a ${rank} matchup for ${STATS[prop.stat].label.toLowerCase()} (${pct(raw - 1)} vs league avg)`);
  }

  const avgPlaying =
    recentLogs.reduce((s, g) => s + g.playing, 0) / Math.max(recentLogs.length, 1);

  // Game environment
  if (env) {
    const e = envFactor(prop.sport, prop.stat, env, avgPlaying);
    mean *= e.factor;
    variance *= e.factor * e.factor;
    reasons.push(...e.reasons);
  }

  // News
  let questionable = false;
  let out = false;
  for (const n of news) {
    if (sameName(n.player, prop.player)) {
      if (n.kind === "player_out") out = true;
      if (n.kind === "player_questionable") questionable = true;
      if (n.kind === "minutes_limit" && n.minutes && avgPlaying > 0) {
        const scale = Math.min(1, n.minutes / avgPlaying);
        mean *= scale;
        variance *= scale;
        reasons.push(`Minutes limit (~${n.minutes} vs ${avgPlaying.toFixed(0)} avg): ${n.headline}`);
      }
    }
    if (n.kind === "teammate_out" && n.team === prop.team && n.affects?.some((a) => sameName(a, prop.player))) {
      const boost = n.usageBoost ?? 0.05;
      mean *= 1 + boost;
      variance *= (1 + boost) ** 2;
      reasons.push(`${n.player} out, usage bump ${pct(boost)}: ${n.headline}`);
    }
    if (n.kind === "opponent_out" && n.team === prop.opponent && n.affects?.some((a) => sameName(a, prop.player))) {
      const boost = n.usageBoost ?? 0.03;
      mean *= 1 + boost;
      reasons.push(`${n.player} (${n.team}) out, weaker defense ${pct(boost)}: ${n.headline}`);
    }
  }
  if (questionable) reasons.push("Player is questionable; probability is less reliable");

  const modelMean = mean;
  const dispersion = variance / Math.max(modelMean, 0.1);
  let marketMean: number | undefined;
  if (market && market.pOver > 0 && market.pOver < 1 && market.line > 0) {
    marketMean = impliedMean(market, dispersion);
    mean = (1 - MARKET_WEIGHT) * modelMean + MARKET_WEIGHT * marketMean;
  } else {
    mean = (1 - LINE_WEIGHT) * modelMean + LINE_WEIGHT * prop.line;
  }
  variance *= mean / Math.max(modelMean, 0.1);

  const { pOver, pPush, pUnder } = overUnder(mean, variance, prop.line);
  const pick = pOver >= pUnder ? "OVER" : "UNDER";
  const pickProb = Math.max(pOver, pUnder);

  let marketProb: number | undefined;
  if (market && marketMean !== undefined) {
    const at = overUnder(marketMean, marketMean * dispersion, prop.line);
    marketProb = pick === "OVER" ? at.pOver : at.pUnder;
    const who = `${market.books ?? 1} book${market.books === 1 ? "" : "s"}${market.sharp ? " incl. a sharp book" : ""}`;
    const gap = market.line - prop.line;
    reasons.push(
      gap === 0
        ? `Sportsbooks (${who}) price the ${pick.toLowerCase()} at ${(marketProb * 100).toFixed(0)}% at the same line`
        : `Sportsbooks deal ${market.line} (${who}), ${Math.abs(gap)} ${gap > 0 ? "above" : "below"} Pick 6: that puts the ${pick.toLowerCase()} at ${(marketProb * 100).toFixed(0)}% here`,
    );
  }

  // Hit rate from this season's games once there are enough of them.
  const last10 = (thisSeason >= EARLY_GAMES ? values.filter((_, i) => !recentLogs[i].prior) : values).slice(0, 10);
  const hits = last10.filter((v) => (pick === "OVER" ? v > prop.line : v < prop.line)).length;
  const hitRateLast10 = last10.length ? hits / last10.length : 0;
  if (last10.length) reasons.push(`Hit the ${pick.toLowerCase()} in ${hits} of last ${last10.length}`);

  const cv = Math.sqrt(variance) / Math.max(mean, 0.5);
  let confidence: Projection["confidence"] = "medium";
  if (base.n < 6 || questionable || cv > 0.7) confidence = "low";
  else if (base.n >= 12 && thisSeason >= EARLY_GAMES && cv < 0.4 && pickProb > 0.58) confidence = "high";
  if (thisSeason < EARLY_GAMES && base.n > thisSeason) reasons.push("Early in the season: leans partly on last year");

  if (out) {
    reasons.unshift("Ruled OUT: this prop will likely be voided");
  }

  return {
    propId: prop.id,
    mean,
    pOver,
    pUnder,
    pPush,
    pick,
    pickProb,
    edge: pickProb - 0.5,
    confidence: out ? "low" : confidence,
    sampleSize: base.n,
    thisSeason,
    hitRateLast10,
    reasons,
    status: out ? "out" : "ok",
    injury: out ? "out" : questionable ? "questionable" : undefined,
    modelMean,
    marketMean,
    marketProb,
  };
}

/** Chance every leg hits, assuming legs are independent. */
export function slipHitProbability(probs: number[]): number {
  return probs.reduce((a, p) => a * p, 1);
}
