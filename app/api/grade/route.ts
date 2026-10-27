import { NextResponse } from "next/server";
import { gradeLeg, type GradeInput } from "@/lib/grade.ts";
import { STATS } from "@/lib/types.ts";

export const maxDuration = 60;

/** Grade saved picks from box scores. Body: { legs: GradeInput[] } → { results: ("hit"|"miss"|"push"|null)[] } */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { legs?: GradeInput[] };
  const legs = (body.legs ?? []).slice(0, 60);
  const results = await Promise.all(
    legs.map((l) =>
      l && typeof l.player === "string" && l.stat in STATS && Number.isFinite(l.line)
        ? gradeLeg(l).catch(() => null)
        : Promise.resolve(null),
    ),
  );
  return NextResponse.json({ results });
}
