// Tailing: copy a crewmate's slip into your own. Only legs whose game hasn't started can be tailed.
import type { Prop, Sport, StatKey } from "./types.ts";

export interface TailLeg {
  player: string;
  stat: StatKey;
  line: number;
  side: "OVER" | "UNDER";
  prob: number;
  sport?: Sport;
  team?: string;
  opponent?: string;
  gameTime?: string;
}

// Same ids the game picker and screenshot import use, so a tailed line merges with one already on the board.
const propId = (player: string, stat: string) => `custom-${player}-${stat}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export function tailLegs(legs: TailLeg[], now = Date.now()) {
  const open = legs.filter((l) => l.sport && l.gameTime && Date.parse(l.gameTime) > now);
  const props: Prop[] = open.map((l) => ({
    id: propId(l.player, l.stat),
    sport: l.sport!,
    player: l.player,
    team: l.team ?? "",
    opponent: l.opponent ?? "",
    stat: l.stat,
    line: l.line,
    gameTime: l.gameTime,
  }));
  const slip = open.map((l, i) => ({ propId: props[i].id, player: l.player, stat: l.stat, line: l.line, side: l.side, prob: l.prob }));
  return { props, slip, skipped: legs.length - open.length };
}
