import { NextResponse } from "next/server";
import { fetchUpcomingGames, type EspnGame } from "@/lib/espn.ts";

export const revalidate = 300;

/** Upcoming NBA and NFL games, for picking players without typing anything. */
export async function GET() {
  const [nba, nfl] = await Promise.all(
    (["NBA", "NFL"] as const).map((s) => fetchUpcomingGames(s).catch(() => [] as EspnGame[])),
  );
  const slim = (g: EspnGame) => ({ id: g.id, date: g.date, state: g.state, teams: g.teams.map(({ stats, ...t }) => t) });
  return NextResponse.json({ NBA: nba.map(slim), NFL: nfl.map(slim) });
}
