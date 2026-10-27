export const pct = (p: number, digits = 0) => `${(p * 100).toFixed(digits)}%`;

/** Most picks one entry can hold (Pick 6 now goes up to 8). */
export const MAX_PICKS = 8;

/** Pick 6 style payouts by number of legs. Edit in the slip if the app shows something different. */
export const DEFAULT_MULTIPLIERS: Record<number, number> = { 2: 3, 3: 6, 4: 10, 5: 20, 6: 40, 7: 75, 8: 150 };
