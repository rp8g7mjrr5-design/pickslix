import { NextResponse } from "next/server";
import { redeemCode } from "@/lib/pro.ts";

/** Redeem a lifetime code: { code } → { key } or { error } */
export async function POST(req: Request) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const result = await redeemCode(String(code ?? "").slice(0, 64));
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}
