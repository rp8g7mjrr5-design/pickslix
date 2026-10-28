import { NextResponse } from "next/server";
import { fetchGameLogs, fetchInjuries, fetchNhlStarters } from "@/lib/espn.ts";
import { loadNflContext } from "@/lib/nflData.ts";
import { nflSlice } from "@/lib/nflverse.ts";
import { loadDefense } from "@/lib/refresh.ts";
import { loadMlbSlice } from "@/lib/mlbData.ts";
import { loadUfcInput } from "@/lib/ufcData.ts";
import { loadUsage } from "@/lib/usageData.ts";
import { toSport, type DefenseFactors } from "@/lib/types.ts";

/**
 * What the browser needs to score any line for one player as the user moves it:
 * recent games, the opponent's defense factors and the injury news for both teams.
 * ?sport=NBA&id=<ESPN athlete id>&team=BOS&opp=BKN (&name=<player> for NFL role trends and NBA teammates out)
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
  const usage = sport === "NBA" && name && team ? await loadUsage({ player: name, team, logs, news }).catch(() => []) : [];
  // UFC: the fight's scheduled rounds and the opponent's history set how long it's likely to last.
  const ufc = sport === "UFC" ? await loadUfcInput(id).catch(() => undefined) : undefined;
  // MLB: tonight's starter, park and weather. Pitchers get the lineup they face instead of a starter.
  const pitcherProp = q.get("role") === "pitcher";
  const mlb = sport === "MLB" && team ? await loadMlbSlice({ player: name, team, pitcherProp, athleteId: id }).catch(() => null) : null;
  return NextResponse.json({
    logs: logs.slice(0, 25),
    defense: opp && defense[opp] ? { [opp]: defense[opp] } : {},
    news: news.filter((n) => n.team === team || n.team === opp),
    // Role trends and position matchups from nflverse, when it's reachable.
    nfl: nfl ? nflSlice(nfl, name, opp) : null,
    // NBA: rotation teammates ruled out, with this player's numbers with and without them.
    usage,
    ufc: ufc ?? null,
    mlb,
  });
}
