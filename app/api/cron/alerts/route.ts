import { NextResponse } from "next/server";
import { runAlerts } from "@/lib/alertsData.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Checks everyone's open picks and sends phone alerts. Meant to run every 15 minutes or so: the GitHub
 * Actions workflow in .github/workflows/alerts.yml calls it with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runAlerts());
}
