import { NextResponse } from "next/server";
import { fetchInjuries, fetchTeamPlayers } from "@/lib/espn.ts";
import { toSport } from "@/lib/types.ts";
import { sameName } from "@/lib/names.ts";

/** One team's players with season averages and injury status. ?sport=NBA&team=<ESPN team id>&abbr=BOS (UFC: team is the fighter's id, &name=) */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const sport = toSport(q.get("sport"));
  const team = q.get("team") ?? "";
  const abbr = q.get("abbr") ?? "";
  if (!/^\d+$/.test(team)) return NextResponse.json({ error: "team is required" }, { status: 400 });
  const [players, injuries] = await Promise.all([
    fetchTeamPlayers(sport, team, q.get("name") ?? "").catch(() => []),
    fetchInjuries(sport).catch(() => []),
  ]);
  const hurt = injuries.filter((n) => n.team === abbr);
  return NextResponse.json({
    players: players.map((p) => {
      const n = hurt.find((h) => sameName(h.player, p.name));
      return { ...p, injury: n?.kind === "player_out" ? "out" : n?.kind === "player_questionable" ? "questionable" : undefined };
    }),
  });
}
