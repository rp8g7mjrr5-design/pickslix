import { NextResponse } from "next/server";
import { fetchGameMarkets, parseGameMarkets, propEdges } from "@/lib/books.ts";
import { oddsEnabled } from "@/lib/odds.ts";
import { checkPass, proRequired } from "@/lib/pro.ts";
import { getProvider } from "@/lib/providers.ts";
import { sampleOddsJson } from "@/lib/sampleBooks.ts";
import { todaysSlate } from "@/lib/slateData.ts";
import { toSport } from "@/lib/types.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sportsbook view for one sport (?sport=NBA): every game's moneyline, spread and total with the fair price and the
 * best book (free, shared and cached), and today's player props bet straight, ranked by EV at the best price. Once
 * Pro is set up, everyone else sees the top prop in full and the count of the rest.
 */
export async function GET(req: Request) {
  const sport = toSport(new URL(req.url).searchParams.get("sport"));
  const sample = getProvider().name === "sample";
  if (!sample && !oddsEnabled()) return NextResponse.json({ enabled: false, games: [], props: [], propCount: 0, locked: false });
  const [markets, slate] = await Promise.all([
    sample ? { games: parseGameMarkets(sampleOddsJson(sport), sport) } : fetchGameMarkets(sport).catch((e) => (console.error(e), null)),
    todaysSlate().catch(() => null),
  ]);
  const now = Date.now();
  const games = (markets?.games ?? []).filter((g) => Date.parse(g.start) > now);
  const props = propEdges((slate?.rows ?? []).filter((r) => r.sport === sport && Date.parse(r.gameTime ?? "") > now));
  const locked = proRequired() && !(await checkPass(req.headers.get("x-pro-key")));
  return NextResponse.json({
    enabled: true,
    sample,
    games,
    props: locked ? props.slice(0, 1) : props.slice(0, 25),
    propCount: props.length,
    locked,
  });
}
