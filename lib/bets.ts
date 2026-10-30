// Sportsbook bets: straight bets and parlays saved from the Sportsbook page, settled from final scores and box
// scores, and added up into a record. Unlike pick'em slips, each bet carries its own price. Pure.
import { decimalOdds, type MarketKey } from "./books.ts";
import type { Sport, StatKey } from "./types.ts";

export type LegResult = "hit" | "miss" | "push";

export interface BetLeg {
  id: string;
  /** "Knicks +5.5", "Tatum o26.5". */
  label: string;
  /** "Knicks @ Celtics · Spread". */
  sub: string;
  sport: Sport;
  /** This leg's own price (American) when bet, and LayLock's chance for it then. */
  price: number;
  fair: number;
  start: string;
  kind: "game" | "prop";
  // Game lines: full team names as the books print them.
  market?: MarketKey;
  side?: "home" | "away" | "over" | "under";
  point?: number;
  home?: string;
  away?: string;
  // Props.
  player?: string;
  stat?: StatKey;
  line?: number;
  pick?: "OVER" | "UNDER";
  team?: string;
  opponent?: string;
  result?: LegResult;
  /** Settled from the scores rather than by hand. */
  auto?: boolean;
  /** Final score or the player's number, for the card. */
  actual?: string;
}

export interface SavedBet {
  id: string;
  createdAt: string;
  stake: number;
  /** The whole bet's price (American): a straight bet's own, or what the book offered for the parlay. */
  odds: number;
  book?: string;
  legs: BetLeg[];
  editedAt?: string;
}

/** Settle one game line from the final score. */
export function gradeGame(leg: Pick<BetLeg, "market" | "side" | "point">, home: number, away: number): LegResult {
  const margin = home - away;
  if (leg.market === "totals") {
    const total = home + away;
    if (total === leg.point) return "push";
    return (total > (leg.point ?? 0)) === (leg.side === "over") ? "hit" : "miss";
  }
  // Moneyline is a spread of zero; a tie (rare outside soccer) is a push at most books.
  const pts = leg.market === "spreads" ? (leg.point ?? 0) : 0;
  const mine = leg.side === "home" ? margin + pts : -margin + pts;
  if (mine === 0) return "push";
  return mine > 0 ? "hit" : "miss";
}

/**
 * What the bet returns per dollar staked, stake included (0 when it lost), or null while a leg is open.
 * A pushed parlay leg drops out: the price shrinks by that leg's own odds.
 */
export function betReturn(b: SavedBet): number | null {
  if (b.legs.some((l) => !l.result)) return null;
  if (b.legs.some((l) => l.result === "miss")) return 0;
  const pushed = b.legs.filter((l) => l.result === "push");
  if (pushed.length === b.legs.length) return 1;
  const dec = pushed.reduce((d, l) => d / decimalOdds(l.price), decimalOdds(b.odds));
  return Math.max(1, dec);
}

export const betProfit = (b: SavedBet): number | null => {
  const r = betReturn(b);
  return r === null ? null : (Number(b.stake) || 0) * (r - 1);
};

/** The bet's chance when placed (legs as independent) and its expected profit at the price taken. */
export function betExpected(b: SavedBet): { chance: number; ev: number } {
  const chance = b.legs.reduce((p, l) => p * (l.fair || 0), 1);
  return { chance, ev: (Number(b.stake) || 0) * (chance * decimalOdds(b.odds) - 1) };
}

export interface BetStats {
  settled: number;
  won: number;
  open: number;
  staked: number;
  profit: number;
  roi: number | null;
  /** What the settled bets were expected to make at the prices taken. */
  expected: number;
}

export function betStats(bets: SavedBet[]): BetStats {
  const s: BetStats = { settled: 0, won: 0, open: 0, staked: 0, profit: 0, roi: null, expected: 0 };
  for (const b of bets) {
    const p = betProfit(b);
    if (p === null) {
      s.open++;
      continue;
    }
    s.settled++;
    if (p > 0) s.won++;
    s.staked += Number(b.stake) || 0;
    s.profit += p;
    s.expected += betExpected(b).ev;
  }
  s.roi = s.staked ? s.profit / s.staked : null;
  return s;
}
