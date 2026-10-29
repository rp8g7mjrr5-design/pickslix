import { NextResponse } from "next/server";
import { rippleLines, softLines } from "@/lib/edges.ts";
import { checkPass, proRequired } from "@/lib/pro.ts";
import { todaysSlate } from "@/lib/slateData.ts";
import { softTrack } from "@/lib/softLog.ts";
import { MIN_GRADED } from "@/lib/softRecord.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Where Pick 6 is behind right now: soft lines and injury ripples (free). Once Pro is set up, everyone else sees
 * one soft line in full (a taste) and the count of the rest. The graded soft-line record comes along too.
 */
export async function GET(req: Request) {
  const [slate, record] = await Promise.all([todaysSlate().catch(() => null), softTrack().catch(() => null)]);
  const track = record && record.hits + record.misses >= MIN_GRADED ? record : null;
  if (!slate) return NextResponse.json({ soft: [], softCount: 0, ripple: [], locked: false, record: track });
  const now = Date.now();
  const soft = softLines(slate.rows, now);
  const ripple = rippleLines(slate.rows, now);
  const locked = proRequired() && !(await checkPass(req.headers.get("x-pro-key")));
  return NextResponse.json({
    soft: locked ? soft.slice(0, 1) : soft.slice(0, 8),
    softCount: soft.length,
    ripple: ripple.slice(0, 6),
    locked,
    record: track,
    at: slate.at,
  });
}
