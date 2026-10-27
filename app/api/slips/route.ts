import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/accounts.ts";
import { dbEnabled, kvGet, kvSet } from "@/lib/db.ts";

export const dynamic = "force-dynamic";

// Signed-in slips live on the account. Signed out, they're stored under a sync code the browser makes up;
// anyone with the code can read and write those slips, so treat it like a password.
const CODE = /^[a-z0-9-]{12,64}$/;
const key = (code: string) => `slips:${code}`;
const userKey = (userId: string) => `slips:user:${userId}`;

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!dbEnabled()) return NextResponse.json({ enabled: false, slips: [] });
  const userId = await currentUserId();
  if (userId) return NextResponse.json({ enabled: true, account: true, owner: userId, slips: (await kvGet<unknown[]>(userKey(userId))) ?? [] });
  if (!CODE.test(code)) return NextResponse.json({ error: "bad code" }, { status: 400 });
  return NextResponse.json({ enabled: true, slips: (await kvGet<unknown[]>(key(code))) ?? [] });
}

export async function PUT(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ enabled: false });
  const raw = await req.text();
  if (raw.length > 500_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: { code?: string; slips?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { code, slips } = body;
  const userId = await currentUserId();
  if (userId && Array.isArray(slips)) {
    await kvSet(userKey(userId), slips);
    return NextResponse.json({ enabled: true, account: true, saved: slips.length });
  }
  if (!code || !CODE.test(code) || !Array.isArray(slips)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  await kvSet(key(code), slips);
  return NextResponse.json({ enabled: true, saved: slips.length });
}
