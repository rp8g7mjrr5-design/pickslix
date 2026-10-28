import { NextResponse } from "next/server";
import { sendTest } from "@/lib/alertsData.ts";
import { ownerFrom } from "../owner.ts";

/** Send a test notification to this owner's devices. Body: { code? } */
export async function POST(req: Request) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: unknown };
  const owner = await ownerFrom(code);
  if (!owner) return NextResponse.json({ error: "bad request" }, { status: 400 });
  return NextResponse.json({ sent: await sendTest(owner).catch(() => 0) });
}
