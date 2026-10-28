import { NextResponse } from "next/server";
import { fetchSlate, teamEnv } from "@/lib/odds.ts";
import { toSport } from "@/lib/types.ts";

/**
 * The game's spread and total from each side. ?sport=NBA&home=Celtics&away=Nets&date=<ISO>
 * Cheap (two credits per sport, shared for hours), so it's open to everyone. Empty without ODDS_API_KEY.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const sport = toSport(q.get("sport"));
  const home = q.get("home") ?? "";
  const away = q.get("away") ?? "";
  const date = q.get("date") ?? new Date().toISOString();
  if (!home || !away) return NextResponse.json({ error: "home and away are required" }, { status: 400 });
  try {
    const slate = await fetchSlate(sport);
    return NextResponse.json({ home: teamEnv(slate, home, away, date, true) ?? null, away: teamEnv(slate, home, away, date, false) ?? null });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ home: null, away: null });
  }
}
