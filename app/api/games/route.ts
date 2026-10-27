import { NextResponse } from "next/server";
import { fetchUpcomingGames, type EspnGame } from "@/lib/espn.ts";
import { SPORTS } from "@/lib/types.ts";

export const revalidate = 300;

/** Upcoming games in every sport, for picking players without typing anything. */
export async function GET() {
  const lists = await Promise.all(SPORTS.map((s) => fetchUpcomingGames(s).catch(() => [] as EspnGame[])));
  const slim = (g: EspnGame) => ({ id: g.id, date: g.date, state: g.state, teams: g.teams.map(({ stats, ...t }) => t) });
  return NextResponse.json(Object.fromEntries(SPORTS.map((s, i) => [s, lists[i].map(slim)])));
}
