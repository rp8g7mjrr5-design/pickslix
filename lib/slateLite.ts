// The slim view of today's scored slate that the browser gets: enough to suggest picks, not the whole board.
import type { PropWithProjection, Sport, StatKey } from "./types.ts";

export interface LiteRow {
  id: string;
  sport: Sport;
  player: string;
  team: string;
  opponent: string;
  stat: StatKey;
  line: number;
  gameTime: string;
  pOver: number;
  pUnder: number;
  pick: "OVER" | "UNDER";
  pickProb: number;
}

export const toLite = (r: PropWithProjection): LiteRow => ({
  id: r.id,
  sport: r.sport,
  player: r.player,
  team: r.team,
  opponent: r.opponent,
  stat: r.stat,
  line: r.line,
  gameTime: r.gameTime ?? "",
  pOver: r.projection.pOver,
  pUnder: r.projection.pUnder,
  pick: r.projection.pick,
  pickProb: r.projection.pickProb,
});
