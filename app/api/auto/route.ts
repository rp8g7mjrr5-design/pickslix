import { NextResponse } from "next/server";
import { autoSummary } from "@/lib/autoSlipData.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Today's auto slip, its record and the last two weeks of slips. Free and shared: everyone sees the same slip. */
export async function GET() {
  return NextResponse.json(await autoSummary());
}
