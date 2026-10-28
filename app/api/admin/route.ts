import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin.ts";
import { kvDel, kvGet, kvKeys, kvSet } from "@/lib/db.ts";
import { ADMIN_CODES, adminCodes, lifetimeCodes, newLifetimeCode, type AdminCode, type ProPass } from "@/lib/pro.ts";

export const dynamic = "force-dynamic";

const denied = () => NextResponse.json({ error: "Admins only." }, { status: 403 });

/** Lifetime codes with who used them, plus site numbers. */
export async function GET() {
  if (!(await isAdmin())) return denied();
  const made = await adminCodes();
  const all = [
    ...lifetimeCodes().map((code) => ({ code, source: "vercel" as const })),
    ...made.map((c) => ({ code: c.code, source: "admin" as const, note: c.note, createdAt: c.createdAt })),
  ];
  const codes = await Promise.all(
    all.map(async (c) => {
      const key = await kvGet<string>(`code:${c.code}`).catch(() => null);
      const pass = key ? await kvGet<ProPass>(`pro:${key}`).catch(() => null) : null;
      return { ...c, used: Boolean(key), usedAt: pass?.createdAt ?? null, revoked: Boolean(key && !pass) };
    }),
  );

  const passKeys = await kvKeys("pro:").catch(() => [] as string[]);
  const passes = await Promise.all(passKeys.map((k) => kvGet<ProPass>(k).catch(() => null)));
  const plans = { monthly: 0, yearly: 0, lifetime: 0, trial: 0 };
  for (const p of passes) {
    if (!p) continue;
    const live = p.plan === "lifetime" || (p.plan === "trial" ? Date.parse(p.until ?? "") > Date.now() : ["active", "trialing", "past_due"].includes(p.status ?? ""));
    if (live) plans[p.plan]++;
  }
  const accounts = (await kvKeys("account:").catch(() => [] as string[])).length;
  const odds = await kvGet<{ remaining: number; at: string }>("odds:remaining").catch(() => null);
  const paused = await kvGet<{ status: number; at: string }>("odds:paused").catch(() => null);

  return NextResponse.json({ codes, stats: { plans, accounts, odds, oddsPaused: paused } });
}

/**
 * { action: "create", count, note } makes new lifetime codes.
 * { action: "delete", code } removes an unused code made here.
 * { action: "revoke", code } turns off the Pro a used code gave.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  const body = (await req.json().catch(() => ({}))) as { action?: string; count?: number; note?: string; code?: string };
  const code = String(body.code ?? "").trim().toUpperCase();

  if (body.action === "create") {
    const count = Math.min(Math.max(Math.floor(Number(body.count) || 1), 1), 25);
    const note = String(body.note ?? "").trim().slice(0, 60) || undefined;
    const fresh: AdminCode[] = Array.from({ length: count }, () => ({ code: newLifetimeCode(), createdAt: new Date().toISOString(), note }));
    await kvSet(ADMIN_CODES, [...fresh, ...(await adminCodes())]);
    return NextResponse.json({ created: fresh.map((c) => c.code) });
  }
  if (body.action === "delete") {
    if (await kvGet(`code:${code}`)) return NextResponse.json({ error: "That code was already used. Revoke it instead." }, { status: 400 });
    await kvSet(ADMIN_CODES, (await adminCodes()).filter((c) => c.code !== code));
    return NextResponse.json({ ok: true });
  }
  if (body.action === "revoke") {
    const key = await kvGet<string>(`code:${code}`);
    if (!key) return NextResponse.json({ error: "That code hasn't been used." }, { status: 400 });
    await kvDel(`pro:${key}`);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
