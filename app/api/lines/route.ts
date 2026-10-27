import { NextResponse } from "next/server";
import { parseLines } from "@/lib/parseLines.ts";
import { getProvider } from "@/lib/providers.ts";
import type { Prop } from "@/lib/types.ts";

export const dynamic = "force-dynamic";

/** Turn pasted text into props: parse it, then look up each player's team and next opponent. */
export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const { lines, skipped } = parseLines(String(text ?? "").slice(0, 50_000));
  const provider = getProvider();
  const resolved = await Promise.all(lines.slice(0, 100).map((l) => provider.resolve(l).catch(() => null)));
  const props: Prop[] = [];
  const unresolved: string[] = [];
  resolved.forEach((p, i) => (p ? props.push(p) : unresolved.push(lines[i].player)));
  return NextResponse.json({ props, skipped, unresolved });
}
