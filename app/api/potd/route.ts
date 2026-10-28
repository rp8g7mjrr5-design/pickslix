import { NextResponse } from "next/server";
import { potdSummary } from "@/lib/potdData.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Today's pick of the day, its public record, and the last few results. */
export async function GET() {
  const data = await potdSummary().catch(() => ({ pick: null, record: { hits: 0, misses: 0, pushes: 0, streak: 0 }, recent: [] }));
  return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } });
}
