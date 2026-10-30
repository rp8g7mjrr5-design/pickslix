import { NextResponse } from "next/server";
import { fetchGameMarkets, parseGameMarkets, propEdges, withModel } from "@/lib/books.ts";
import { loadRatings } from "@/lib/ratingsData.ts";
import { sampleRatings } from "@/lib/sampleBooks.ts";
import { oddsEnabled, oddsHold } from "@/lib/odds.ts";
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
  let failed: string | undefined;
  if (!sample && !oddsEnabled()) return NextResponse.json({ enabled: false, games: [], props: [], propCount: 0, locked: false });
  const [markets, slate, ratings] = await Promise.all([
    sample
      ? { games: parseGameMarkets(sampleOddsJson(sport), sport) }
      : fetchGameMarkets(sport).catch((e) => {
          console.error(e);
          failed = e instanceof Error ? e.message.replace(/ for .*/, "") : "Odds API error";
          return null;
        }),
    todaysSlate().catch(() => null),
    sample ? sampleRatings(sport) : loadRatings(sport).catch(() => null),
  ]);
  const now = Date.now();
  const games = withModel((markets?.games ?? []).filter((g) => Date.parse(g.start) > now), ratings);
  const props = propEdges((slate?.rows ?? []).filter((r) => r.sport === sport && Date.parse(r.gameTime ?? "") > now));
  // Say why there are no lines instead of an empty board: out of credits, paused after an error, or the call failed.
  const hold = markets ? null : await oddsHold();
  const problem = hold?.reason === "paused"
    ? `The Odds API turned LayLock away (${hold.status === 401 ? "key rejected or monthly credits used up" : "too many requests"}), so odds calls are paused for an hour.`
    : hold?.reason === "credits"
      ? `Odds API credits are used up for the month (${hold.remaining} left). Lines come back when they reset or the plan is upgraded.`
      : failed
        ? `The Odds API call failed (${failed}). It will try again on the next load.`
        : undefined;
  const locked = proRequired() && !(await checkPass(req.headers.get("x-pro-key")));
  return NextResponse.json({
    enabled: true,
    sample,
    problem,
    games,
    props: locked ? props.slice(0, 1) : props.slice(0, 25),
    propCount: props.length,
    locked,
  });
}
