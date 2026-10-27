import { NextResponse } from "next/server";
import { currentUserId, getAccount, setAccountProKey } from "@/lib/accounts.ts";
import { checkPass, normalizeKey } from "@/lib/pro.ts";

/** Attach a working Pro key (bought before accounts, or on another device) to the signed-in account. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { key } = (await req.json().catch(() => ({}))) as { key?: string };
  const proKey = normalizeKey(String(key ?? ""));
  if (!(await checkPass(proKey))) return NextResponse.json({ error: "That key isn't active." }, { status: 400 });
  // Don't swap out a working pass the account already has for a different one.
  const current = (await getAccount(userId)).proKey;
  if (current && current !== proKey && (await checkPass(current))) {
    return NextResponse.json({ linked: false, proKey: current });
  }
  await setAccountProKey(userId, proKey);
  return NextResponse.json({ linked: true, proKey });
}
