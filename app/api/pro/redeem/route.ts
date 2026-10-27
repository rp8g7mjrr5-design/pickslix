import { NextResponse } from "next/server";
import { accountsEnabled, currentUserId, setAccountProKey } from "@/lib/accounts.ts";
import { redeemCode } from "@/lib/pro.ts";

/** Redeem a lifetime code: { code } → { key } or { error } */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (accountsEnabled() && !userId) return NextResponse.json({ error: "Sign in first so lifetime Pro is saved to your account." }, { status: 401 });
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const result = await redeemCode(String(code ?? "").slice(0, 64));
  if ("key" in result && userId) await setAccountProKey(userId, result.key);
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}
