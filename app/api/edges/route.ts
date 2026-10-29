import { NextResponse } from "next/server";
import { rippleLines, softLines } from "@/lib/edges.ts";
import { checkPass, proRequired } from "@/lib/pro.ts";
import { todaysSlate } from "@/lib/slateData.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Where Pick 6 is behind right now: soft lines (Pro once Pro is set up; others get the count) and injury
 * ripples (free).
 */
export async function GET(req: Request) {
  const slate = await todaysSlate().catch(() => null);
  if (!slate) return NextResponse.json({ soft: [], softCount: 0, ripple: [], locked: false });
  const now = Date.now();
  const soft = softLines(slate.rows, now);
  const ripple = rippleLines(slate.rows, now);
  const locked = proRequired() && !(await checkPass(req.headers.get("x-pro-key")));
  return NextResponse.json({ soft: locked ? [] : soft.slice(0, 8), softCount: soft.length, ripple: ripple.slice(0, 6), locked, at: slate.at });
}
