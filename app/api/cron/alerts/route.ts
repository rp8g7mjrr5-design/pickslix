import { NextResponse } from "next/server";
import { runAlerts } from "@/lib/alertsData.ts";
import { potdSummary } from "@/lib/potdData.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Checks everyone's open picks and sends phone alerts. Meant to run every 15 minutes or so: the GitHub
 * Actions workflow in .github/workflows/alerts.yml calls it with `Authorization: Bearer $CRON_SECRET`.
 * It also locks in the pick of the day once lines are up, and grades past ones.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [alerts, potd] = await Promise.all([runAlerts(), potdSummary().catch(() => null)]);
  return NextResponse.json({ ...alerts, pickOfTheDay: potd?.pick ? `${potd.pick.player} ${potd.pick.side} ${potd.pick.line} ${potd.pick.stat}` : null });
}
