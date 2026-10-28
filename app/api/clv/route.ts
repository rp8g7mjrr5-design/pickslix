import { NextResponse } from "next/server";
import { loadCloses } from "@/lib/odds.ts";
import { SPORTS, STATS, type Sport } from "@/lib/types.ts";

export const dynamic = "force-dynamic";

/** Closing prices for picks whose games have started. Body: { legs: { sport, player, stat, gameTime }[] } → { closes } */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { legs?: { sport?: string; player?: string; stat?: string; gameTime?: string }[] };
  const legs = (body.legs ?? []).slice(0, 100);
  const ok = legs.map(
    (l) =>
      typeof l?.player === "string" && typeof l.gameTime === "string" && Date.parse(l.gameTime) < Date.now() &&
      SPORTS.includes(l.sport as Sport) && (l.stat ?? "") in STATS,
  );
  const closes = await loadCloses(
    legs.map((l, i) => (ok[i] ? (l as { sport: Sport; player: string; stat: string; gameTime: string }) : { sport: "NBA", player: "", stat: "", gameTime: "1970-01-01" })),
  ).catch(() => legs.map(() => null));
  return NextResponse.json({ closes: closes.map((c, i) => (ok[i] ? c : null)) });
}
