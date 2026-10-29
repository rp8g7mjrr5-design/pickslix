import { NextResponse } from "next/server";
import { softTrack } from "@/lib/softLog.ts";
import { MIN_GRADED } from "@/lib/softRecord.ts";

export const dynamic = "force-dynamic";

/** The soft-line track record for the Pro page, once there's enough of it to mean something. */
export async function GET() {
  const record = await softTrack().catch(() => null);
  return NextResponse.json({ record: record && record.hits + record.misses >= MIN_GRADED ? record : null });
}
