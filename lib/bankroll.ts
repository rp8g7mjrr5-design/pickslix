// Bankroll coach: a weekly budget, a suggested entry for each slip from its edge, and a heads-up when it looks
// like chasing losses. Sizing is a quarter of the Kelly stake (the full one swings far too hard for parlays),
// measured against the week's budget. Pure.
import type { SavedSlip } from "./storage.ts";

/** Monday 00:00 local time of the week `now` falls in. */
export function weekStart(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function weekSpent(slips: SavedSlip[], now = Date.now()): number {
  const from = weekStart(now);
  return slips.filter((s) => Date.parse(s.createdAt) >= from).reduce((t, s) => t + (Number(s.entry) || 0), 0);
}

const KELLY_SHARE = 0.25;

/**
 * Suggested entry for a slip that hits with chance `p` and pays `mult` times the entry. 0 means the slip
 * isn't worth playing at this payout.
 */
export function suggestEntry(p: number, mult: number, budget: number, spent: number): number {
  const b = mult - 1;
  if (!(budget > 0) || !(b > 0) || !(p > 0)) return 0;
  const kelly = (p * b - (1 - p)) / b;
  if (kelly <= 0) return 0;
  const left = Math.max(0, budget - spent);
  const raw = Math.min(KELLY_SHARE * kelly * budget, left);
  return raw < 1 ? (left >= 1 ? 1 : 0) : Math.floor(raw);
}

/** Lost the last few slips and the new entry is well above what they usually play. */
export function chasing(slips: SavedSlip[], entry: number): boolean {
  const settled = slips
    .filter((s) => s.legs?.length && s.legs.every((l) => l.result))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lastThree = settled.slice(0, 3);
  if (lastThree.length < 3) return false;
  const lost = lastThree.every((s) => s.legs.some((l) => l.result === "miss"));
  const usual = settled.reduce((t, s) => t + (Number(s.entry) || 0), 0) / settled.length;
  return lost && usual > 0 && entry >= 1.5 * usual;
}
