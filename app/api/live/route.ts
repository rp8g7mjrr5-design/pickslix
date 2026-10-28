import { NextResponse } from "next/server";
import { espnDate, fetchScoreboard, fetchSummary, type EspnGame } from "@/lib/espn.ts";
import { parseBox, progress, type LiveBox, type LiveLeg } from "@/lib/live.ts";
import { canonTeam } from "@/lib/names.ts";
import { SPORTS, STATS, type Sport, type StatKey } from "@/lib/types.ts";

export const dynamic = "force-dynamic";

interface Body {
  legs?: { sport?: string; player?: string; team?: string; stat?: string; line?: number; side?: string; gameTime?: string }[];
}

/** How each open pick is doing in a game that's on now. Body: { legs } → { live: (LiveLeg | null)[] } */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const legs = (body.legs ?? []).slice(0, 40);
  const boards = new Map<string, Promise<EspnGame[]>>();
  const boxes = new Map<string, Promise<LiveBox | null>>();

  const one = async (l: NonNullable<Body["legs"]>[number]): Promise<LiveLeg | null> => {
    const sport = l?.sport as Sport;
    const t = Date.parse(l?.gameTime ?? "");
    if (!SPORTS.includes(sport) || sport === "UFC" || !(l.stat! in STATS) || typeof l.player !== "string" || !l.team) return null;
    if (!Number.isFinite(l.line) || (l.side !== "OVER" && l.side !== "UNDER") || !Number.isFinite(t) || t > Date.now()) return null;
    const day = `${sport}:${espnDate(new Date(t))}`;
    if (!boards.has(day)) boards.set(day, fetchScoreboard(sport, `dates=${day.split(":")[1]}`, 30).then((b) => b.games, () => []));
    const team = canonTeam(l.team, sport);
    const game = (await boards.get(day)!).find((g) => g.teams.some((x) => x.abbr === team));
    if (!game) return null;
    if (!boxes.has(game.id)) boxes.set(game.id, fetchSummary(sport, game.id, game.state === "post" ? 3600 : 20).then((j) => parseBox(j, sport), () => null));
    const box = await boxes.get(game.id)!;
    return box ? progress({ player: l.player, stat: l.stat as StatKey, line: l.line!, side: l.side }, box) : null;
  };

  const live = await Promise.all(legs.map((l) => one(l).catch(() => null)));
  return NextResponse.json({ live });
}
