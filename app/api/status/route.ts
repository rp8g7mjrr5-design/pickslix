import { NextResponse } from "next/server";
import { dbEnabled, kvGet } from "@/lib/db.ts";
import { oddsEnabled } from "@/lib/odds.ts";
import { visionEnabled } from "@/lib/vision.ts";

export const dynamic = "force-dynamic";

/** Which optional pieces this deployment has turned on. Never returns the values themselves. */
export async function GET() {
  const [nba, odds] = await Promise.all([
    kvGet<{ updatedAt: string }>("defense:NBA").catch(() => null),
    kvGet<{ remaining: number; at: string }>("odds:remaining").catch(() => null),
  ]);
  return NextResponse.json({
    database: dbEnabled(),
    cron: Boolean(process.env.CRON_SECRET),
    screenshots: visionEnabled(),
    odds: oddsEnabled(),
    oddsRemaining: odds?.remaining ?? null,
    defenseUpdatedAt: nba?.updatedAt ?? null,
    dataSource: (process.env.DATA_SOURCE ?? "espn").toLowerCase(),
  });
}
