// The auto slip: LayLock's own Pick 6 entry for the day, the best More pick from each game on the scored slate. It is
// built once, then tended on every scan: a pick whose player is ruled out, whose line is pulled or that the model
// turns against is swapped for the next best one until its game starts. Graded in public like the pick of the day.
// Pure: loading, saving and grading are in autoSlipData.ts.
import { expectedReturn, hitDistribution, payoutTable, slipMultiplier } from "./platforms.ts";
import { STATS, type PropWithProjection, type Sport, type StatKey } from "./types.ts";

export interface AutoLeg {
  sport: Sport;
  player: string;
  team: string;
  opponent: string;
  stat: StatKey;
  line: number;
  side: "OVER" | "UNDER";
  /** The model's chance for this side when it was last checked. */
  prob: number;
  /** The model's chance before its self-tuning, which is what the tuning learns from. */
  rawProb?: number;
  gameTime: string;
  /** Plain-English reasons, for the card. */
  reasons: string[];
  marketProb?: number;
  result?: "hit" | "miss" | "push";
}

export interface AutoSlip {
  /** Every sport gets its own slip. */
  sport: Sport;
  /** US Eastern date the slip is for, YYYYMMDD. */
  date: string;
  builtAt: string;
  updatedAt: string;
  /** Goes up each time a pick is swapped, so a phone alert goes out once per change. */
  version: number;
  legs: AutoLeg[];
  /** Pick 6's payout for all of them hitting. */
  multiplier: number;
  /** Chance every pick hits, and what $1 returns on average at that payout. */
  chance: number;
  expected: number;
  /** What changed since it was built, newest last ("Swapped A for B: A ruled out"). */
  changes: string[];
  result?: "win" | "loss" | "refund";
}

export const MIN_LEGS = 2;
export const MAX_LEGS = 8;
/** A thin sample, a coin flip or a game about to start, and it isn't picked. */
const MIN_GAMES = 8;
/** The model has to lean More, and the books (when they've priced it) can't lean Less. */
const MIN_PROB = 0.5;
const MIN_MARKET = 0.5;
/** Below this a pick already on the slip gets swapped out: the model no longer leans More. */
const KEEP_PROB = 0.5;
const LEAD_MS = 20 * 60_000;

const gameOf = (l: { team: string; opponent: string }) => [l.team, l.opponent].sort().join("-");
const same = (l: AutoLeg, r: PropWithProjection) => l.player === r.player && l.stat === r.stat;
const started = (l: AutoLeg, now: number) => Date.parse(l.gameTime) - now <= LEAD_MS;

/** Lines worth a spot: Pick 6's own, a real sample, healthy, not about to start, and the books not leaning the other way. */
export function candidates(rows: (PropWithProjection & { pick6?: boolean })[], now = Date.now()): PropWithProjection[] {
  return rows
    .filter((r) => {
      const p = r.projection;
      // Pick 6 only takes More on most props, so the slip never leans on a Less it can't enter.
      if (p.pick !== "OVER") return false;
      if (r.pick6 === false || p.status !== "ok" || p.injury || p.confidence === "low" || p.sampleSize < MIN_GAMES) return false;
      if (STATS[r.stat].sport === "UFC" || !r.gameTime || Date.parse(r.gameTime) - now <= LEAD_MS) return false;
      return p.pickProb > MIN_PROB && (p.marketProb === undefined || p.marketProb >= MIN_MARKET);
    })
    .sort((a, b) => score(b) - score(a));
}

// The model's chance, nudged up by how strongly the books agree (and down a little when there's no price to check).
const score = (r: PropWithProjection) => {
  const m = r.projection.marketProb;
  return r.projection.pickProb + (m !== undefined ? 0.25 * (m - 0.5) : -0.02);
};

const rawOf = (r: PropWithProjection) => {
  const p = r.projection;
  const raw = p.pick === "OVER" ? p.rawPOver : p.rawPUnder;
  const other = p.pick === "OVER" ? p.rawPUnder : p.rawPOver;
  return raw !== undefined && other !== undefined && raw + other > 0 ? Math.round((raw / (raw + other)) * 1000) / 1000 : undefined;
};

export const toLeg = (r: PropWithProjection): AutoLeg => ({
  sport: r.sport,
  player: r.player,
  team: r.team,
  opponent: r.opponent,
  stat: r.stat,
  line: r.line,
  side: r.projection.pick,
  prob: Math.round(r.projection.pickProb * 1000) / 1000,
  rawProb: rawOf(r),
  gameTime: r.gameTime!,
  reasons: r.projection.reasons.slice(0, 3),
  marketProb: r.projection.marketProb,
});

/**
 * Take the best lines in order, one per player and one per game (picks in the same game move together). On a
 * night with only one or two games, two picks may share a game.
 */
function fill(pool: PropWithProjection[], n: number, taken: AutoLeg[], perGame = 1): AutoLeg[] {
  const players = new Set(taken.map((l) => l.player));
  const games = new Map<string, number>();
  for (const l of taken) games.set(gameOf(l), (games.get(gameOf(l)) ?? 0) + 1);
  const out: AutoLeg[] = [];
  for (const r of pool) {
    if (out.length >= n) break;
    if (players.has(r.player) || (games.get(gameOf(r)) ?? 0) >= perGame) continue;
    players.add(r.player);
    games.set(gameOf(r), (games.get(gameOf(r)) ?? 0) + 1);
    out.push(toLeg(r));
  }
  return out;
}

/** Picks allowed per game: one, unless the day has fewer than three games to spread them over. */
/** One pick per game, always: picks in the same game rise and fall together. */
const perGameFor = (_rows: PropWithProjection[]) => 1;

/** Price a set of picks at Pick 6's payout. */
export function price(legs: AutoLeg[]): Pick<AutoSlip, "multiplier" | "chance" | "expected"> {
  const tiers = payoutTable("pick6", legs.length, "power");
  const dist = hitDistribution(legs.map((l) => l.prob));
  return { multiplier: tiers[legs.length] ?? 0, chance: dist[legs.length] ?? 0, expected: expectedReturn(dist, tiers) };
}

/**
 * The slip: the best More pick from every game (by the model's chance, which weighs the matchup, nudged by the
 * books), up to Pick 6's 8. Two picks may share a game only on a night too short to fill a slip otherwise.
 */
export function buildSlip(rows: PropWithProjection[], sport: Sport, date: string, now = Date.now()): AutoSlip | null {
  const mine = rows.filter((r) => r.sport === sport);
  const legs = fill(candidates(mine, now), MAX_LEGS, [], perGameFor(mine));
  if (legs.length < MIN_LEGS) return null;
  legs.sort((a, b) => a.gameTime.localeCompare(b.gameTime));
  const at = new Date(now).toISOString();
  return { sport, date, builtAt: at, updatedAt: at, version: 1, legs, ...price(legs), changes: [] };
}

/** The best More pick in every game that hasn't started, slip or not (a slip stops at 8), in start order. */
export function bestPerGame(rows: PropWithProjection[], sport: Sport, now = Date.now()): AutoLeg[] {
  return fill(candidates(rows.filter((r) => r.sport === sport), now), Infinity, [], 1).sort((a, b) => a.gameTime.localeCompare(b.gameTime));
}

/** Why a pick on the slip should come off, or undefined while it still holds. */
function why(l: AutoLeg, row: PropWithProjection | undefined): string | undefined {
  if (l.side === "UNDER") return "Pick 6 only offers More on it";
  if (!row) return "its line was taken down";
  const p = row.projection;
  if (p.injury === "out" || p.status === "out") return "ruled out";
  if (p.injury) return "listed as questionable";
  if (p.pick !== l.side) return "the model now likes less";
  if (p.pickProb < KEEP_PROB) return "the model cooled on it";
  return undefined;
}

/**
 * Re-check the slip against the latest slate. Picks whose games are close to starting stay as they are; any other
 * pick that no longer holds is swapped for the best line that fits, or dropped if nothing does (keeping 2 or more).
 */
export function tendSlip(prev: AutoSlip, rows: PropWithProjection[], now = Date.now()): AutoSlip {
  const legs: AutoLeg[] = [];
  const changes: string[] = [];
  const out: { leg: AutoLeg; reason: string }[] = [];
  const seen = new Set(prev.legs.filter((l) => l.result || started(l, now)).map(gameOf));
  // Strongest first, so when two picks share a game the weaker one comes off.
  for (const l of [...prev.legs].sort((a, b) => b.prob - a.prob)) {
    if (l.result || started(l, now)) {
      legs.push(l);
      continue;
    }
    const row = rows.find((r) => same(l, r));
    const reason = seen.has(gameOf(l)) ? "another pick from the same game is stronger" : why(l, row);
    seen.add(gameOf(l));
    if (reason) out.push({ leg: l, reason });
    // Still good: keep it, at the line and chance Pick 6 shows now.
    else legs.push({ ...l, line: row!.line, prob: Math.round(row!.projection.pickProb * 1000) / 1000, rawProb: rawOf(row!), reasons: row!.projection.reasons.slice(0, 3), marketProb: row!.projection.marketProb });
  }
  const mine = rows.filter((r) => r.sport === prev.sport);
  const pool = candidates(mine, now).filter((r) => !out.some((o) => o.leg.player === r.player));
  const fresh = fill(pool, out.length, legs, perGameFor(mine));
  out.forEach((o, i) => {
    const sub = fresh[i];
    const name = `${o.leg.player} ${o.leg.side === "OVER" ? "more" : "less"} than ${o.leg.line} ${STATS[o.leg.stat].label.toLowerCase()}`;
    if (sub) {
      legs.push(sub);
      changes.push(`Swapped ${name} for ${sub.player} ${sub.side === "OVER" ? "more" : "less"} than ${sub.line} ${STATS[sub.stat].label.toLowerCase()}: ${o.reason}`);
    } else if (legs.length + (out.length - i - 1) >= MIN_LEGS) {
      changes.push(`Dropped ${name}: ${o.reason}, and no other line was good enough`);
    } else {
      // Nothing to swap in and the slip would be too short: leave it, flagged.
      legs.push(o.leg);
      changes.push(`Heads up on ${name}: ${o.reason}, and no other line was good enough to swap in`);
    }
  });
  // Games whose lines came up after the slip was built get their best pick too, up to Pick 6's 8.
  for (const a of fill(pool, MAX_LEGS - legs.length, legs, 1)) {
    legs.push(a);
    changes.push(`Added ${a.player} ${a.side === "OVER" ? "more" : "less"} than ${a.line} ${STATS[a.stat].label.toLowerCase()}: its game's lines came up`);
  }
  const kept = legs.sort((a, b) => a.gameTime.localeCompare(b.gameTime));
  if (!changes.length) return { ...prev, legs: kept, ...price(kept), updatedAt: new Date(now).toISOString() };
  return { ...prev, legs: kept, ...price(kept), version: prev.version + 1, changes: [...prev.changes, ...changes], updatedAt: new Date(now).toISOString() };
}

/** Win, loss or refund once every pick is graded (a pushed pick shrinks the entry, as the app does). */
export function settle(s: AutoSlip): AutoSlip["result"] {
  if (s.legs.some((l) => l.result === "miss")) return "loss";
  if (s.legs.some((l) => !l.result)) return undefined;
  const m = slipMultiplier({ entry: 1, multiplier: s.multiplier, platform: "pick6", legs: s.legs });
  return m > 1 ? "win" : m === 1 ? "refund" : "loss";
}

/** What the slip paid per $1 entered, once settled. */
export const slipReturn = (s: AutoSlip) => (s.result ? slipMultiplier({ entry: 1, multiplier: s.multiplier, platform: "pick6", legs: s.legs }) : 0);

export interface AutoRecord {
  wins: number;
  losses: number;
  refunds: number;
  legsHit: number;
  legsGraded: number;
  /** Profit if $10 went on every slip. */
  profit10: number;
}

export function autoRecord(history: AutoSlip[]): AutoRecord {
  const r: AutoRecord = { wins: 0, losses: 0, refunds: 0, legsHit: 0, legsGraded: 0, profit10: 0 };
  for (const s of history) {
    for (const l of s.legs) {
      if (l.result === "hit") r.legsHit++;
      if (l.result === "hit" || l.result === "miss") r.legsGraded++;
    }
    if (!s.result) continue;
    if (s.result === "win") r.wins++;
    else if (s.result === "loss") r.losses++;
    else r.refunds++;
    r.profit10 += 10 * (slipReturn(s) - 1);
  }
  return r;
}

/** The picks as text to paste or read off while entering them in Pick 6. */
export const slipText = (s: AutoSlip) =>
  s.legs.map((l) => `${l.player}: ${l.side === "OVER" ? "More" : "Less"} than ${l.line} ${STATS[l.stat].label}`).join("\n");
