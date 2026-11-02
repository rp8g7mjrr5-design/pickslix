import { NextResponse } from "next/server";
import { AUTO_SPORTS, savedToday, sportSummary } from "@/lib/autoSlipData.ts";
import type { Sport } from "@/lib/types.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * ?sport=NBA: that sport's auto slip for today (scanned if it's stale), its record and recent slips.
 * No sport: which sports have a slip today, from what's saved (no scan), for the tabs.
 */
export async function GET(req: Request) {
  const sport = new URL(req.url).searchParams.get("sport")?.toUpperCase() as Sport | undefined;
  if (!sport) return NextResponse.json({ sports: await savedToday() });
  if (!AUTO_SPORTS.includes(sport)) return NextResponse.json({ error: "unknown sport" }, { status: 400 });
  return NextResponse.json(await sportSummary(sport));
}
