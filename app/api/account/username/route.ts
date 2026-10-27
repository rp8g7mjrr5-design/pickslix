import { NextResponse } from "next/server";
import { currentUserId, setUsername } from "@/lib/accounts.ts";

/** { username } → { username } or { error }. An empty name takes you off the leaderboard. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { username } = (await req.json().catch(() => ({}))) as { username?: string };
  const result = await setUsername(userId, String(username ?? "").slice(0, 40));
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}
