import { NextResponse } from "next/server";
import { checkPass, proRequired } from "@/lib/pro.ts";

export const dynamic = "force-dynamic";

/** { key } → { pro, plan, required } */
export async function POST(req: Request) {
  const { key } = (await req.json().catch(() => ({}))) as { key?: string };
  const pass = await checkPass(key);
  return NextResponse.json({ required: proRequired(), pro: Boolean(pass), plan: pass?.plan ?? null });
}
