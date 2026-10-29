// Leaderboard math. Only picks that count are ones graded from the box score (not marked by hand)
// and saved before their game started, so nobody climbs by marking wins or adding finished games.
import { slipProfit, type PayoutTiers, type PlatformId, type Play } from "./platforms.ts";

export interface LeaderLeg {
  result?: "hit" | "miss" | "push";
  auto?: boolean;
  gameTime?: string;
}
export interface LeaderSlip {
  createdAt: string;
  entry: number;
  multiplier: number;
  platform?: PlatformId;
  play?: Play;
  tiers?: PayoutTiers;
  legs: LeaderLeg[];
}

export interface LeaderStats {
  picks: number;
  hits: number;
  hitRate: number;
  slips: number;
  /** Profit over amount staked on fully settled slips whose every leg counts. */
  roi: number | null;
}

/** Fewest counted picks before someone is ranked. */
export const MIN_PICKS = 10;

const counts = (s: LeaderSlip, l: LeaderLeg) =>
  Boolean(l.auto && l.result && l.gameTime && Date.parse(s.createdAt) < Date.parse(l.gameTime));

export function leaderStats(slips: LeaderSlip[]): LeaderStats {
  let picks = 0;
  let hits = 0;
  let staked = 0;
  let profit = 0;
  let settled = 0;
  for (const s of slips) {
    if (!Array.isArray(s?.legs)) continue;
    for (const l of s.legs) {
      if (!counts(s, l) || l.result === "push") continue;
      picks++;
      if (l.result === "hit") hits++;
    }
    const entry = Number(s.entry) || 0;
    if (!s.legs.length || !s.legs.every((l) => counts(s, l)) || entry <= 0) continue;
    settled++;
    staked += entry;
    profit += slipProfit(s);
  }
  return { picks, hits, hitRate: picks ? hits / picks : 0, slips: settled, roi: staked ? profit / staked : null };
}

/** Best hit rate first among people with enough picks; more picks breaks ties. */
export const rank = <T extends LeaderStats>(rows: T[]) =>
  rows.filter((r) => r.picks >= MIN_PICKS).sort((a, b) => b.hitRate - a.hitRate || b.picks - a.picks);
