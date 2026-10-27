import type { PropWithProjection } from "./types.ts";

/** Fewest recent games before the model's number is worth leaning on. */
const MIN_GAMES = 6;

/**
 * The strongest picks on the board for an n-pick slip: highest model chance first, skipping players
 * who are out or questionable, thin samples, and a second pick from the same game (those legs move together).
 */
export function bestSlip(rows: PropWithProjection[], n: number): PropWithProjection[] {
  const ranked = rows
    .filter((r) => r.projection.status === "ok" && !r.projection.injury && r.projection.sampleSize >= MIN_GAMES)
    .sort((a, b) => b.projection.pickProb - a.projection.pickProb);
  const games = new Set<string>();
  const players = new Set<string>();
  const out: PropWithProjection[] = [];
  for (const r of ranked) {
    if (out.length >= n) break;
    const game = r.team && r.opponent ? [r.team, r.opponent].sort().join("-") : "";
    if (players.has(r.player) || (game && games.has(game))) continue;
    players.add(r.player);
    if (game) games.add(game);
    out.push(r);
  }
  return out;
}
