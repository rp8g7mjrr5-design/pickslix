import { NextResponse } from "next/server";
import { dbEnabled, kvGet, kvSet } from "@/lib/db.ts";

export const dynamic = "force-dynamic";

// Slips are stored under a sync code the browser makes up (no accounts). Anyone with the code can read
// and write those slips, so treat it like a password.
const CODE = /^[a-z0-9-]{12,64}$/;
const key = (code: string) => `slips:${code}`;

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!dbEnabled()) return NextResponse.json({ enabled: false, slips: [] });
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
  if (!code || !CODE.test(code) || !Array.isArray(slips)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  await kvSet(key(code), slips);
  return NextResponse.json({ enabled: true, saved: slips.length });
}
