import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/accounts.ts";
import { dbEnabled, kvGet, kvSet } from "@/lib/db.ts";

export const dynamic = "force-dynamic";

// Sportsbook bets, stored like slips (app/api/slips): on the account when signed in, else under the sync code.
const CODE = /^[a-z0-9-]{12,64}$/;
const key = (code: string) => `bets:${code}`;
const userKey = (userId: string) => `bets:user:${userId}`;

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!dbEnabled()) return NextResponse.json({ enabled: false, bets: [] });
  const userId = await currentUserId();
  if (userId) return NextResponse.json({ enabled: true, account: true, owner: userId, bets: (await kvGet<unknown[]>(userKey(userId))) ?? [] });
  if (!CODE.test(code)) return NextResponse.json({ error: "bad code" }, { status: 400 });
  return NextResponse.json({ enabled: true, bets: (await kvGet<unknown[]>(key(code))) ?? [] });
}

export async function PUT(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ enabled: false });
  const raw = await req.text();
  if (raw.length > 500_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: { code?: string; bets?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { code, bets } = body;
  const userId = await currentUserId();
  if (userId && Array.isArray(bets)) {
    await kvSet(userKey(userId), bets);
    return NextResponse.json({ enabled: true, account: true, saved: bets.length });
  }
  if (!code || !CODE.test(code) || !Array.isArray(bets)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  await kvSet(key(code), bets);
  return NextResponse.json({ enabled: true, saved: bets.length });
}
