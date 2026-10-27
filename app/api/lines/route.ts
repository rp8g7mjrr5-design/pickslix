import { NextResponse } from "next/server";
import { parseLines } from "@/lib/parseLines.ts";
import { resolveLines } from "@/lib/resolveLines.ts";

export const dynamic = "force-dynamic";

/** Turn pasted text into props: parse it, then look up each player's team and next opponent. */
export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const { lines, skipped } = parseLines(String(text ?? "").slice(0, 50_000));
  return NextResponse.json(await resolveLines(lines, skipped));
}
