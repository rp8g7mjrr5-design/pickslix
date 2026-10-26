export const pct = (p: number, digits = 0) => `${(p * 100).toFixed(digits)}%`;

/** Pick 6 style payouts by number of legs. Edit in the slip if the app shows something different. */
export const DEFAULT_MULTIPLIERS: Record<number, number> = { 2: 3, 3: 6, 4: 10, 5: 20, 6: 40 };
