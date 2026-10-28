import { NextResponse } from "next/server";
import { dbEnabled, kvGet } from "@/lib/db.ts";
import { oddsEnabled } from "@/lib/odds.ts";
import { accountsEnabled } from "@/lib/accounts.ts";
import { lifetimeCodes, prices, stripeEnabled } from "@/lib/pro.ts";
import { visionEnabled } from "@/lib/vision.ts";
import { alertsEnabled } from "@/lib/alertsData.ts";

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
    accounts: accountsEnabled(),
    stripe: stripeEnabled(),
    stripePrices: Boolean(prices().monthly || prices().yearly),
    lifetimeCodes: lifetimeCodes().length,
    tips: Boolean(process.env.NEXT_PUBLIC_TIP_URL),
    alerts: alertsEnabled(),
    dataSource: (process.env.DATA_SOURCE ?? "espn").toLowerCase(),
  });
}
