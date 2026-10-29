// Crew week: every crew (a head-to-head is a crew of two) plays a weekly contest on the picks members already
// save. Same rules as the leaderboard: only picks graded from the box score and saved before the game count.
// Most net wins (hits minus misses) for the week takes it; the winner gets a badge. Pure.
import type { LeaderSlip } from "./leaderboard.ts";

/** Weeks run Monday to Sunday, US Eastern (near enough: UTC-5). The id is the Monday, YYYY-MM-DD. */
export function weekOf(t: number): string {
  const d = new Date(t - 5 * 3600_000);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export const prevWeek = (week: string) => weekOf(Date.parse(`${week}T12:00:00Z`) - 7 * 86400_000);

export interface WeekScore {
  hits: number;
  misses: number;
  picks: number;
  net: number;
}

export function weekScore(slips: LeaderSlip[], week: string): WeekScore {
  const out = { hits: 0, misses: 0, picks: 0, net: 0 };
  for (const s of slips) {
    if (!Array.isArray(s?.legs)) continue;
    for (const l of s.legs) {
      if (!l.auto || !l.gameTime || !(Date.parse(s.createdAt) < Date.parse(l.gameTime)) || weekOf(Date.parse(l.gameTime)) !== week) continue;
      if (l.result === "hit") out.hits++;
      else if (l.result === "miss") out.misses++;
    }
  }
  out.picks = out.hits + out.misses;
  out.net = out.hits - out.misses;
  return out;
}

/** Fewest counted picks in a week to take it. */
export const WEEK_MIN = 3;

export function standings<M extends { memberId: string; username: string; slips: LeaderSlip[] }>(members: M[], week: string) {
  const rows = members
    .map((m) => ({ memberId: m.memberId, username: m.username, ...weekScore(m.slips, week) }))
    .sort((a, b) => b.net - a.net || b.hits - a.hits || a.username.localeCompare(b.username));
  const [first, second] = rows;
  const clear = first && first.picks >= WEEK_MIN && first.net > 0 && (!second || second.net < first.net || second.hits < first.hits);
  return { rows, winner: clear ? first : null };
}
