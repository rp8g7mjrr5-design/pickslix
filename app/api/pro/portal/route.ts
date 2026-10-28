import { NextResponse } from "next/server";
import { checkPass, normalizeKey, stripe, stripeEnabled } from "@/lib/pro.ts";
import { kvGet } from "@/lib/db.ts";
import type { ProPass } from "@/lib/pro.ts";

/** Stripe's billing page, to change card or cancel: { key } → { url } */
export async function POST(req: Request) {
  if (!stripeEnabled()) return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
  const { key } = (await req.json().catch(() => ({}))) as { key?: string };
  // A cancelled pass can still open billing to resubscribe, so read the stored pass, not just active ones.
  const pass = (await checkPass(key)) ?? (await kvGet<ProPass>(`pro:${normalizeKey(key ?? "")}`).catch(() => null));
  if (!pass?.customer) return NextResponse.json({ error: "There's no Stripe subscription behind this Pro (it came from a code or an admin), so there's no billing to manage." }, { status: 404 });
  try {
    const session = await stripe("/billing_portal/sessions", {
      form: { customer: pass.customer, return_url: `${new URL(req.url).origin}/pro` },
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Couldn't open billing. The site owner needs to turn on Stripe's customer portal (Settings → Billing → Customer portal, in test mode too)." }, { status: 502 });
  }
}
