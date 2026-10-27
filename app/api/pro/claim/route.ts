import { NextResponse } from "next/server";
import { claimCheckout, stripeEnabled } from "@/lib/pro.ts";

/** After Checkout: { sessionId } → { key, plan } */
export async function POST(req: Request) {
  if (!stripeEnabled()) return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
  const { sessionId } = (await req.json().catch(() => ({}))) as { sessionId?: string };
  try {
    const claimed = await claimCheckout(String(sessionId ?? ""));
    if (!claimed) return NextResponse.json({ error: "We couldn't find that payment yet. Refresh in a moment." }, { status: 404 });
    return NextResponse.json({ key: claimed.key, plan: claimed.pass.plan });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Couldn't confirm the payment. Refresh in a moment." }, { status: 502 });
  }
}
