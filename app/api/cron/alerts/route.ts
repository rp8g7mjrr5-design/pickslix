import { NextResponse } from "next/server";
import { runAlerts } from "@/lib/alertsData.ts";
import { tendLock } from "@/lib/lockData.ts";
import { potdSummary } from "@/lib/potdData.ts";
import { autoSummary } from "@/lib/autoSlipData.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Checks everyone's open picks and sends phone alerts. Meant to run every 30 minutes: the GitHub
 * Actions workflow in .github/workflows/alerts.yml calls it with `Authorization: Bearer $CRON_SECRET`.
 * It also locks in the pick of the day and the Daily Lock menu once lines are up, and grades past ones.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Scan and tend the auto slip first, so its alert goes out in the same run.
  const auto = await autoSummary(Date.now(), true).catch(() => null);
  const [alerts, potd, lock] = await Promise.all([runAlerts(Date.now(), auto?.slip), potdSummary().catch(() => null), tendLock().catch(() => 0)]);
  return NextResponse.json({ ...alerts, autoSlip: auto?.slip ? `${auto.slip.legs.length} picks, version ${auto.slip.version}` : null, dailyLockOptions: lock, pickOfTheDay: potd?.pick ? `${potd.pick.player} ${potd.pick.side} ${potd.pick.line} ${potd.pick.stat}` : null });
}
