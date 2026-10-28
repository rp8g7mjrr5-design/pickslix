import { NextResponse } from "next/server";
import { checkUsername, currentUserId, setUsername, updateAccount } from "@/lib/accounts.ts";

export const dynamic = "force-dynamic";

/** ?name= → { ok } or { ok: false, error }, so the form can say a name is taken as it's typed. */
export async function GET(req: Request) {
  const name = (new URL(req.url).searchParams.get("name") ?? "").slice(0, 40);
  return NextResponse.json(await checkUsername(await currentUserId(), name).catch(() => ({ ok: true as const })));
}

/** { username } → { username } or { error }; { hidden } shows or hides the account on the leaderboard. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { username, hidden } = (await req.json().catch(() => ({}))) as { username?: string; hidden?: boolean };
  if (typeof hidden === "boolean") {
    await updateAccount(userId, { hidden: hidden || undefined });
    if (username === undefined) return NextResponse.json({ hidden });
  }
  const result = await setUsername(userId, String(username ?? "").slice(0, 40));
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}
