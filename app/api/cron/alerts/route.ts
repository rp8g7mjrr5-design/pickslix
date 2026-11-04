import { NextResponse } from "next/server";
import { runAlerts } from "@/lib/alertsData.ts";
import { tendLock } from "@/lib/lockData.ts";
import { potdSummary } from "@/lib/potdData.ts";
import { autoSummary, lastScans } from "@/lib/autoSlipData.ts";
import { kvGet } from "@/lib/db.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const auto = await autoSummary(Date.now(), true).catch(() => []);
  const slips = auto.flatMap((a) => (a.slip ? [a.slip] : []));
  const [alerts, potd, lock] = await Promise.all([runAlerts(Date.now(), slips), potdSummary().catch(() => null), tendLock().catch(() => 0)]);
  const [remaining, paused] = await Promise.all([kvGet<{ remaining: number }>("odds:remaining").catch(() => null), kvGet("odds:paused").catch(() => null)]);
  return NextResponse.json({ ...alerts, oddsCreditsLeft: remaining?.remaining ?? null, oddsPaused: Boolean(paused), scans: Object.fromEntries(lastScans), autoSlips: Object.fromEntries(slips.map((s) => [s.sport, `${s.legs.length} picks, version ${s.version}`])), dailyLockOptions: lock, pickOfTheDay: potd?.pick ? `${potd.pick.player} ${potd.pick.side} ${potd.pick.line} ${potd.pick.stat}` : null });
}
