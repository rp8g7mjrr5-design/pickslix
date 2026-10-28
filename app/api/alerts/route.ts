import { NextResponse } from "next/server";
import { addSubscription, alertsEnabled, removeSubscription, type PushSub } from "@/lib/alertsData.ts";
import { dbEnabled } from "@/lib/db.ts";
import { ownerFrom } from "./owner.ts";

export const dynamic = "force-dynamic";

const validSub = (s: any): s is PushSub =>
  typeof s?.endpoint === "string" && s.endpoint.startsWith("https://") && typeof s?.keys?.p256dh === "string" && typeof s?.keys?.auth === "string";

/** Turn alerts on for this device. Body: { subscription, code? } */
export async function POST(req: Request) {
  if (!alertsEnabled() || !dbEnabled()) return NextResponse.json({ error: "Alerts aren't set up on this site yet." }, { status: 503 });
  const { subscription, code } = (await req.json().catch(() => ({}))) as { subscription?: unknown; code?: unknown };
  const owner = await ownerFrom(code);
  if (!owner || !validSub(subscription)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  await addSubscription(owner, { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } });
  return NextResponse.json({ ok: true });
}

/** Turn alerts off for this device. Body: { endpoint, code? } */
export async function DELETE(req: Request) {
  const { endpoint, code } = (await req.json().catch(() => ({}))) as { endpoint?: unknown; code?: unknown };
  const owner = await ownerFrom(code);
  if (!owner || typeof endpoint !== "string") return NextResponse.json({ error: "bad request" }, { status: 400 });
  await removeSubscription(owner, endpoint);
  return NextResponse.json({ ok: true });
}
