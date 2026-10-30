import { NextResponse } from "next/server";
import { fetchGameLines, oddsEnabled, withAltLines } from "@/lib/odds.ts";
import { checkPass, proRequired } from "@/lib/pro.ts";
import { toSport } from "@/lib/types.ts";

/**
 * Prop lines for one game, Pick 6 first. ?sport=NBA&home=Celtics&away=Nets&date=<ISO>[&alt=prizepicks]
 * Without ODDS_API_KEY this answers { enabled: false } and the picker starts lines at season averages.
 */
export async function GET(req: Request) {
  if (!oddsEnabled()) return NextResponse.json({ enabled: false, lines: {} });
  // Lines cost API credits, so they're a Pro feature once Pro is set up.
  if (proRequired() && !(await checkPass(req.headers.get("x-pro-key")))) {
    return NextResponse.json({ enabled: true, locked: true, lines: {} });
  }
  const q = new URL(req.url).searchParams;
  const home = q.get("home") ?? "";
  const away = q.get("away") ?? "";
  if (!home || !away) return NextResponse.json({ error: "home and away are required" }, { status: 400 });
  try {
    const sport = toSport(q.get("sport"));
    const date = q.get("date") ?? new Date().toISOString();
    let lines = await fetchGameLines(sport, home, away, date);
    // ?alt=prizepicks adds that app's goblin and demon lines.
    const alt = q.get("alt");
    if (alt) lines = await withAltLines(sport, home, away, date, alt, lines).catch(() => lines);
    return NextResponse.json({ enabled: true, lines });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ enabled: true, lines: {}, error: "Couldn't load lines right now" });
  }
}
