import { NextResponse } from "next/server";
import { fetchGameLogs, fetchInjuries, fetchNhlStarters } from "@/lib/espn.ts";
import { loadNflContext } from "@/lib/nflData.ts";
import { nflSlice } from "@/lib/nflverse.ts";
import { loadDefense } from "@/lib/refresh.ts";
import { toSport, type DefenseFactors } from "@/lib/types.ts";

/**
 * What the browser needs to score any line for one player as the user moves it:
 * recent games, the opponent's defense factors and the injury news for both teams.
 * ?sport=NBA&id=<ESPN athlete id>&team=BOS&opp=BKN (&name=<player> for NFL extras)
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const sport = toSport(q.get("sport"));
  const id = q.get("id") ?? "";
  const team = q.get("team") ?? "";
  const opp = q.get("opp") ?? "";
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const name = q.get("name") ?? "";
  const [logs, defense, news, nfl] = await Promise.all([
    fetchGameLogs(id, sport).catch(() => []),
    loadDefense(sport).catch((): DefenseFactors => ({})),
    // Hockey adds who's starting in goal.
    Promise.all([fetchInjuries(sport).catch(() => []), sport === "NHL" ? fetchNhlStarters().catch(() => []) : []]).then((l) => l.flat()),
    sport === "NFL" && name ? loadNflContext().catch(() => null) : null,
  ]);
  return NextResponse.json({
    logs: logs.slice(0, 25),
    defense: opp && defense[opp] ? { [opp]: defense[opp] } : {},
    news: news.filter((n) => n.team === team || n.team === opp),
    // Role trends and position matchups from nflverse, when it's reachable.
    nfl: nfl ? nflSlice(nfl, name, opp) : null,
  });
}
