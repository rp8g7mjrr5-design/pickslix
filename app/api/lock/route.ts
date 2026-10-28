import { NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db.ts";
import { badgesFor, lockRecord, nextBadge, type LockOption } from "@/lib/lock.ts";
import { loadEntries, lockIn, todaysMenu } from "@/lib/lockData.ts";
import { ownerFrom } from "../alerts/owner.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The model's lean stays hidden until you've locked in (or the game has started). */
const hideLean = (o: LockOption, show: boolean) => (show ? o : { ...o, lean: undefined, leanProb: undefined });

/** Today's menu, your lock for today, your record and recent locks. ?code= for signed-out browsers. */
export async function GET(req: Request) {
  const now = Date.now();
  const [menu, owner] = await Promise.all([todaysMenu(now).catch(() => null), ownerFrom(new URL(req.url).searchParams.get("code"))]);
  const entries = owner && dbEnabled() ? await loadEntries(owner, now).catch(() => []) : [];
  const today = menu ? entries.find((e) => e.date === menu.date) : undefined;
  const record = lockRecord(entries);
  return NextResponse.json({
    enabled: dbEnabled(),
    menu: menu ? { date: menu.date, options: menu.options.map((o) => hideLean(o, Boolean(today) || Date.parse(o.gameTime) <= now)) } : null,
    today: today ?? null,
    record,
    badges: badgesFor(record.best),
    next: nextBadge(record.streak) ?? null,
    recent: entries.filter((e) => e.result).slice(0, 10),
    account: Boolean(owner && "user" in owner),
  });
}

/** Lock in today's pick. Body: { optionId, side, code? } */
export async function POST(req: Request) {
  const { optionId, side, code } = (await req.json().catch(() => ({}))) as { optionId?: unknown; side?: unknown; code?: unknown };
  const owner = await ownerFrom(code);
  if (!owner || !dbEnabled() || typeof optionId !== "string" || (side !== "OVER" && side !== "UNDER")) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const entry = await lockIn(owner, optionId, side);
  if ("error" in entry) return NextResponse.json(entry, { status: 409 });
  return NextResponse.json({ today: entry });
}
