import { NextResponse } from "next/server";
import { crowdCounts, crowdKey } from "@/lib/crowd.ts";
import { dbEnabled, kvClaim, kvHashAll, kvHashIncr } from "@/lib/db.ts";
import { espnDate } from "@/lib/espn.ts";
import { MAX_PICKS } from "@/lib/format.ts";
import { STATS } from "@/lib/types.ts";

export const dynamic = "force-dynamic";

const KEEP_S = 3 * 86400;
const dayKey = (date: string) => `crowd:${date}`;

/** Which side LayLock players took on today's lines. */
export async function GET() {
  const counts = crowdCounts(await kvHashAll(dayKey(espnDate(new Date()))).catch(() => ({})));
  return NextResponse.json({ counts }, { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } });
}

/** Count a saved slip's picks, once per slip. Body: { slipId, legs: [{ player, stat, line, side, gameTime }] } */
export async function POST(req: Request) {
  const { slipId, legs } = (await req.json().catch(() => ({}))) as { slipId?: unknown; legs?: unknown };
  if (typeof slipId !== "string" || !/^[a-f0-9-]{36}$/.test(slipId) || !Array.isArray(legs)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (dbEnabled() && !(await kvClaim(`crowd:seen:${slipId}`, 1, KEEP_S))) return NextResponse.json({ ok: true });
  const now = Date.now();
  let counted = 0;
  for (const l of legs.slice(0, MAX_PICKS) as any[]) {
    const t = Date.parse(l?.gameTime ?? "");
    // Only picks made before the game count, and only for real stats.
    if (typeof l?.player !== "string" || !(l?.stat in STATS) || !Number.isFinite(l?.line) || (l?.side !== "OVER" && l?.side !== "UNDER") || !(t > now)) continue;
    await kvHashIncr(dayKey(espnDate(new Date(t))), `${crowdKey(l.player.slice(0, 60), l.stat, Number(l.line))}|${l.side}`, 1, KEEP_S).catch(() => {});
    counted++;
  }
  return NextResponse.json({ ok: true, counted });
}
