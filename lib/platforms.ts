// The pick'em apps LayLock scores lines for. Each posts its own lines and pays its own table: a "power" entry
// pays only when every pick hits; a "flex" entry still pays something with one (or two) misses. The tables are
// each app's standard payouts as of fall 2026. Apps change them and some vary them pick by pick, so the slip lets
// you edit every number. Pure: shared by the slip, the tracker, profiles and the leaderboard.

export type PlatformId = "pick6" | "prizepicks" | "underdog" | "betr" | "sleeper";

/** Hits → multiplier, for one entry size. */
export type PayoutTiers = Record<number, number>;

export interface Platform {
  id: PlatformId;
  name: string;
  /** The Odds API bookmaker key for this app's lines, when the API carries it. */
  book?: string;
  /** Fewest and most picks one entry can hold. */
  min: number;
  max: number;
  /** Every pick hits → multiplier, by entry size. */
  power: Record<number, number>;
  /** Entry size → (hits → multiplier), for the sizes that offer a flex play. */
  flex?: Record<number, PayoutTiers>;
  /** What the app calls its flex play. */
  flexName?: string;
  /**
   * LayLock's names for this app's alternate lines below and above its standard one, when the API carries them
   * (PrizePicks' goblins and demons). Our own words, not the app's.
   */
  alt?: { below: string; above: string };
  /** What the app calls the two sides. */
  over: string;
  under: string;
  /** Said under the payout: where to check it. */
  payoutNote: string;
}

export const PLATFORMS: Record<PlatformId, Platform> = {
  pick6: {
    id: "pick6",
    name: "Pick 6",
    book: "pick6",
    min: 2,
    max: 8,
    power: { 2: 3, 3: 6, 4: 10, 5: 20, 6: 40, 7: 75, 8: 150 },
    over: "More",
    under: "Less",
    payoutNote: "Check the payout in the DraftKings app; it changes with the picks you choose.",
  },
  prizepicks: {
    id: "prizepicks",
    name: "PrizePicks",
    book: "prizepicks",
    min: 2,
    max: 6,
    power: { 2: 3, 3: 5, 4: 10, 5: 20, 6: 37.5 },
    flex: {
      3: { 3: 2.25, 2: 1.25 },
      4: { 4: 5, 3: 1.5 },
      5: { 5: 10, 4: 2, 3: 0.4 },
      6: { 6: 25, 5: 2, 4: 0.4 },
    },
    flexName: "Flex Play",
    alt: { below: "Safety", above: "Stretch" },
    over: "More",
    under: "Less",
    payoutNote: "Standard lines shown. Safety lines pay less and stretch lines pay more; edit the payout to match.",
  },
  underdog: {
    id: "underdog",
    name: "Underdog",
    book: "underdog",
    min: 2,
    max: 8,
    power: { 2: 3, 3: 6, 4: 10, 5: 20, 6: 37.5, 7: 65, 8: 120 },
    flex: {
      3: { 3: 3, 2: 1 },
      4: { 4: 6, 3: 1.5 },
      5: { 5: 10, 4: 2.5 },
      6: { 6: 25, 5: 2.6, 4: 0.25 },
      7: { 7: 40, 6: 2.75, 5: 0.5 },
      8: { 8: 80, 7: 3, 6: 1 },
    },
    flexName: "Flex",
    over: "Higher",
    under: "Lower",
    payoutNote: "Boosted and discounted picks change the payout; edit it to match the Underdog app.",
  },
  betr: {
    id: "betr",
    name: "Betr Picks",
    book: "betr_us_dfs",
    min: 2,
    max: 6,
    power: { 2: 3, 3: 6, 4: 10, 5: 20, 6: 35 },
    flex: {
      3: { 3: 3, 2: 1 },
      4: { 4: 6, 3: 1.5 },
      5: { 5: 10, 4: 2 },
      6: { 6: 25, 5: 2, 4: 0.4 },
    },
    flexName: "Flex",
    over: "More",
    under: "Less",
    payoutNote: "Check the payout in the Betr app before you submit.",
  },
  sleeper: {
    id: "sleeper",
    name: "Sleeper",
    min: 2,
    max: 8,
    power: { 2: 3, 3: 6, 4: 10, 5: 20, 6: 40, 7: 75, 8: 150 },
    over: "Over",
    under: "Under",
    payoutNote: "Sleeper prices each pick on its own, so set the payout the app shows.",
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];
export const DEFAULT_PLATFORM: PlatformId = "pick6";
export const toPlatform = (v: unknown): PlatformId => (PLATFORM_IDS.includes(v as PlatformId) ? (v as PlatformId) : DEFAULT_PLATFORM);
/** The Odds API keys of every pick'em app it carries, for one bookmakers list. */
export const DFS_BOOKS = PLATFORM_IDS.map((id) => PLATFORMS[id].book).filter((b): b is string => Boolean(b));

export type Play = "power" | "flex";

/** The payout table for an entry of `n` picks: hits → multiplier. Power pays only on n of n. */
export function payoutTable(id: PlatformId, n: number, play: Play): PayoutTiers {
  const p = PLATFORMS[id];
  if (play === "flex" && p.flex?.[n]) return { ...p.flex[n] };
  const top = p.power[n];
  return top ? { [n]: top } : {};
}

export const hasFlex = (id: PlatformId, n: number) => Boolean(PLATFORMS[id].flex?.[n]);

/** Chance of each number of hits (index = hits) for independent picks. */
export function hitDistribution(probs: number[]): number[] {
  let dist = [1];
  for (const p of probs) {
    const next = new Array<number>(dist.length + 1).fill(0);
    dist.forEach((q, k) => {
      next[k] += q * (1 - p);
      next[k + 1] += q * p;
    });
    dist = next;
  }
  return dist;
}

/** What one unit staked returns on average (1.0 is break-even) given the chance of each hit count. */
export const expectedReturn = (dist: number[], tiers: PayoutTiers) => dist.reduce((s, q, k) => s + q * (tiers[k] ?? 0), 0);

/**
 * The chance each pick needs, all picks alike, for the entry to break even at these payouts. Found by
 * bisection, since a flex table has no closed form.
 */
export function breakEvenProb(n: number, tiers: PayoutTiers): number {
  if (!Object.values(tiers).some((m) => m > 0)) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (expectedReturn(hitDistribution(new Array(n).fill(mid)), tiers) < 1) lo = mid;
    else hi = mid;
  }
  return hi;
}

interface PayoutSlip {
  entry: number;
  multiplier: number;
  platform?: PlatformId;
  play?: Play;
  /** Hits → multiplier as set when the slip was saved (flex). */
  tiers?: PayoutTiers;
  legs: { result?: "hit" | "miss" | "push" }[];
}

/**
 * The multiplier a settled slip earned. A push removes the pick; the apps then pay the smaller entry's table,
 * and refund an entry left with fewer than two picks.
 */
export function slipMultiplier(s: PayoutSlip): number {
  const live = s.legs.filter((l) => l.result !== "push");
  const hits = live.filter((l) => l.result === "hit").length;
  const pushed = live.length < s.legs.length;
  if (pushed && live.length < 2) return 1;
  if (live.length < 2) return 0;
  const play = s.play ?? "power";
  if (pushed && s.platform) {
    // The smaller entry's table, scaled by however the saved payout differed from the app's standard one.
    const std = payoutTable(s.platform, s.legs.length, play)[s.legs.length];
    const scale = std && s.multiplier > 0 ? s.multiplier / std : 1;
    return (payoutTable(s.platform, live.length, play)[hits] ?? 0) * scale;
  }
  if (play === "flex" && s.tiers && !pushed) return Number(s.tiers[hits]) || 0;
  return hits === live.length ? Number(s.multiplier) || 0 : 0;
}

/** Profit on a settled slip. */
export const slipProfit = (s: PayoutSlip) => (Number(s.entry) || 0) * (slipMultiplier(s) - 1);
