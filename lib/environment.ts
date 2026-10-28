// Game environment: what the spread and total say about a player's night. A high implied team total means
// more possessions and more scoring to go around; a big spread means starters may sit late (NBA) or the
// game script tilts toward passing or running (NFL). Weights are deliberately modest: the books' prop prices
// already carry some of this, and the model still leans on the player's own games first.
import type { TeamEnv } from "./odds.ts";
import { statSport, type Sport, type StatKey } from "./types.ts";

/** How much of the team-total gap (vs the slate average) carries into each stat. */
const TEAM_WEIGHT: Partial<Record<StatKey, number>> = {
  PTS: 0.6, AST: 0.5, "3PM": 0.6, PRA: 0.55, PR: 0.55, PA: 0.6,
  PASS_YDS: 0.5, PASS_TD: 0.7, PASS_ATT: 0.3, RUSH_YDS: 0.4, REC: 0.3, REC_YDS: 0.5, RUSH_REC_YDS: 0.45,
  SOG: 0.4, GOALS: 0.7, NHL_AST: 0.7, NHL_PTS: 0.7,
  HITS: 0.4, TB: 0.6, HRR: 0.7, RUNS: 0.8, RBI: 0.8,
};
/** Rebounds follow pace (the game total) more than either team's scoring. */
const PACE_WEIGHT: Partial<Record<StatKey, number>> = { REB: 0.5, RA: 0.5 };
/** Goalie and pitcher stats move with what the opponent is expected to score. Negative: fewer outs and strikeouts. */
const OPP_WEIGHT: Partial<Record<StatKey, number>> = { SAVES: 0.4, HITS_ALLOWED: 0.5, OUTS: -0.4, K: -0.2 };
const NFL_PASSING: StatKey[] = ["PASS_YDS", "PASS_TD", "PASS_ATT", "REC", "REC_YDS"];
/** NBA starters (this many minutes or more) lose time in blowouts. College games are 40 minutes. */
const STARTER_MINUTES: Partial<Record<Sport, number>> = { NBA: 28, CBB: 25 };
/** Spread where blowout minutes start to bite. College spreads run bigger. */
const BLOWOUT_SPREAD: Partial<Record<Sport, number>> = { NBA: 10, CBB: 15 };
const MAX_SWING = 0.15;

const signed = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(0)}%`;
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** Multiplier on the player's mean from the game environment, with the reasons behind it. */
export function envFactor(sport: Sport, stat: StatKey, env: TeamEnv, avgPlaying: number): { factor: number; reasons: string[] } {
  const reasons: string[] = [];
  const avgTeam = env.avgTotal / 2;
  let factor = 1;

  const team = TEAM_WEIGHT[stat];
  const pace = PACE_WEIGHT[stat];
  const opp = OPP_WEIGHT[stat];
  if (team !== undefined) {
    const f = 1 + (env.teamTotal / avgTeam - 1) * team;
    if (Math.abs(f - 1) >= 0.01)
      reasons.push(`Implied team total ${fmt(env.teamTotal)} vs ${fmt(avgTeam)} slate average: ${signed(f - 1)}`);
    factor *= f;
  } else if (pace !== undefined) {
    const f = 1 + (env.total / env.avgTotal - 1) * pace;
    if (Math.abs(f - 1) >= 0.01) reasons.push(`Game total ${fmt(env.total)} vs ${fmt(env.avgTotal)} slate average: ${signed(f - 1)}`);
    factor *= f;
  } else if (opp !== undefined) {
    const f = 1 + (env.oppTotal / avgTeam - 1) * opp;
    if (Math.abs(f - 1) >= 0.01) reasons.push(`Opponent implied for ${fmt(env.oppTotal)} vs ${fmt(avgTeam)} average: ${signed(f - 1)}`);
    factor *= f;
  }

  const gap = Math.abs(env.spread);
  const blowout = BLOWOUT_SPREAD[sport];
  if (blowout !== undefined && gap >= blowout && avgPlaying >= (STARTER_MINUTES[sport] ?? 0)) {
    const f = 1 - Math.min(0.06, 0.012 * (gap - blowout + 1));
    reasons.push(`${fmt(gap)}-point spread: blowout risk, starters may sit late (${signed(f - 1)})`);
    factor *= f;
  }
  if (statSport(sport) === "NFL" && gap >= 3) {
    // Trailing teams throw; leading teams run out the clock. env.spread is positive for the underdog.
    const lean = Math.max(-0.06, Math.min(0.06, 0.006 * env.spread));
    const f = NFL_PASSING.includes(stat) ? 1 + lean : stat === "RUSH_YDS" ? 1 - lean : 1;
    if (f !== 1) {
      reasons.push(`Game script: ${env.spread > 0 ? `${fmt(gap)}-point underdog, likely throwing more` : `${fmt(gap)}-point favorite, likely running more`} (${signed(f - 1)})`);
      factor *= f;
    }
  }
  factor = Math.max(1 - MAX_SWING, Math.min(1 + MAX_SWING, factor));
  return { factor, reasons };
}
