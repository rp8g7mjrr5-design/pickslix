import { NextResponse } from "next/server";
import { buildBoard } from "@/lib/board.ts";
import { getProvider } from "@/lib/providers.ts";
import { sampleProps } from "@/lib/sampleData.ts";
import { STATS, type Prop } from "@/lib/types.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = getProvider();
  const board = await buildBoard(sampleProps(), provider);
  return NextResponse.json({ provider: provider.name, board });
}

/** Score lines the user entered by hand (or pasted from Pick 6). */
export async function POST(req: Request) {
  const body = (await req.json()) as { props?: Prop[] };
  const props = (body.props ?? []).filter(
    (p) => p && typeof p.player === "string" && p.stat in STATS && Number.isFinite(p.line),
  );
  const provider = getProvider();
  const board = await buildBoard(props, provider);
  return NextResponse.json({ provider: provider.name, board });
}
