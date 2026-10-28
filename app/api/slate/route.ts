import { NextResponse } from "next/server";
import { todaysSlate } from "@/lib/slateData.ts";
import { toLite } from "@/lib/slateLite.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Today's scored lines that haven't started, slimmed down, for pick suggestions in the browser. */
export async function GET() {
  const slate = await todaysSlate().catch(() => null);
  const now = Date.now();
  const rows = (slate?.rows ?? []).filter((r) => r.projection.status === "ok" && Date.parse(r.gameTime ?? "") > now).map(toLite);
  return NextResponse.json({ rows, at: slate?.at ?? null }, { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } });
}
