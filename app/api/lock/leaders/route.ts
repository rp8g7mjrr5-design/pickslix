import { NextResponse } from "next/server";
import { lockLeaders } from "@/lib/lockData.ts";

export const dynamic = "force-dynamic";

/** The Daily Lock streak leaderboard (accounts with a username). */
export async function GET() {
  return NextResponse.json(await lockLeaders().catch(() => ({ rows: [], at: new Date().toISOString() })));
}
