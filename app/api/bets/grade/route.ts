import { NextResponse } from "next/server";
import { gradeBetLeg } from "@/lib/betGrade.ts";
import type { BetLeg } from "@/lib/bets.ts";

export const maxDuration = 60;

/** Settle sportsbook bet legs. Body: { legs: BetLeg[] } → { graded: ({ result, actual } | null)[] } */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { legs?: BetLeg[] };
  const legs = (body.legs ?? []).slice(0, 60);
  const graded = await Promise.all(legs.map((l) => (l && typeof l === "object" ? gradeBetLeg(l).catch(() => null) : Promise.resolve(null))));
  return NextResponse.json({ graded });
}
