import { NextResponse } from "next/server";
import { accountsEnabled, currentUserId, getAccount } from "@/lib/accounts.ts";
import { checkPass } from "@/lib/pro.ts";

export const dynamic = "force-dynamic";

/** The signed-in account's Pro key, so a new device picks up Pro on sign-in. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ enabled: accountsEnabled(), signedIn: false });
  const { proKey } = await getAccount(userId).catch(() => ({ proKey: undefined }));
  const pass = proKey ? await checkPass(proKey) : null;
  return NextResponse.json({ enabled: true, signedIn: true, proKey: proKey ?? null, pro: Boolean(pass), plan: pass?.plan ?? null });
}
