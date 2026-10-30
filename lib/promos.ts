// Sportsbook promos, priced: profit boosts, odds boosts, bonus (free) bets and no-sweat bets. Each comes down to
// what the bet returns on average at a fair chance, and for bonus bets, how much cash a hedge locks in. Pure.
import { decimalOdds, toAmerican } from "./books.ts";

export interface PromoResult {
  /** Expected profit in dollars. */
  ev: number;
  /** Expected profit per dollar of your own money at risk (cash promos) or per bonus dollar. */
  evPct: number;
  /** What it pays if it wins, profit only. */
  winProfit: number;
  /** The price the promo really gets you, as American odds. */
  effective: number;
}

/** A chance from American odds with no margin removed (for a fair price the person already de-vigged). */
export const chanceOf = (american: number) => 1 / decimalOdds(american);

/** Profit boost: winnings are multiplied by 1 + boost (25% → 0.25), up to `maxStake`. */
export function profitBoost(odds: number, boost: number, stake: number, fair: number, maxStake = Infinity): PromoResult {
  const boosted = Math.min(stake, maxStake);
  const winProfit = boosted * (decimalOdds(odds) - 1) * (1 + boost) + (stake - boosted) * (decimalOdds(odds) - 1);
  const ev = fair * winProfit - (1 - fair) * stake;
  return { ev, evPct: ev / stake, winProfit, effective: toAmerican(1 / (1 + winProfit / stake)) };
}

/** Odds boost: the book pays `boosted` instead of its usual price. */
export function oddsBoost(boosted: number, stake: number, fair: number): PromoResult {
  const winProfit = stake * (decimalOdds(boosted) - 1);
  const ev = fair * winProfit - (1 - fair) * stake;
  return { ev, evPct: ev / stake, winProfit, effective: boosted };
}

/** Bonus bet: the stake isn't yours to lose and isn't paid back, only the winnings. */
export function bonusBet(odds: number, amount: number, fair: number): PromoResult {
  const winProfit = amount * (decimalOdds(odds) - 1);
  const ev = fair * winProfit;
  return { ev, evPct: ev / amount, winProfit, effective: odds };
}

/**
 * Lock in a bonus bet: bet the bonus on one side at `odds`, and real cash on the other side at `hedgeOdds` (another
 * book) so both outcomes pay the same. Returns the cash stake and the profit either way.
 */
export function hedgeBonus(odds: number, amount: number, hedgeOdds: number): { hedge: number; profit: number; conversion: number } {
  const win = amount * (decimalOdds(odds) - 1);
  const hedge = win / decimalOdds(hedgeOdds);
  const profit = win - hedge;
  return { hedge, profit, conversion: profit / amount };
}

/**
 * No-sweat (second chance) bet: lose and the book refunds up to `cap` as a bonus bet, worth `conversion` of its
 * face value (about 0.7 when used well at plus odds).
 */
export function noSweat(odds: number, stake: number, fair: number, cap = stake, conversion = 0.7): PromoResult {
  const winProfit = stake * (decimalOdds(odds) - 1);
  const refund = Math.min(stake, cap) * conversion;
  const ev = fair * winProfit - (1 - fair) * (stake - refund);
  return { ev, evPct: ev / stake, winProfit, effective: odds };
}
