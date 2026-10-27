import { NextResponse } from "next/server";
import { prices, stripe, stripeEnabled } from "@/lib/pro.ts";

/** Start a Stripe Checkout for a Pro subscription. Body: { plan: "monthly" | "yearly" } → { url } */
export async function POST(req: Request) {
  if (!stripeEnabled()) return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
  const { plan } = (await req.json().catch(() => ({}))) as { plan?: string };
  const price = plan === "yearly" ? prices().yearly : prices().monthly;
  if (!price) return NextResponse.json({ error: "That plan isn't available." }, { status: 400 });
  const origin = new URL(req.url).origin;
  try {
    const session = await stripe("/checkout/sessions", {
      form: {
        mode: "subscription",
        "line_items[0][price]": price,
        "line_items[0][quantity]": "1",
        allow_promotion_codes: "true",
        success_url: `${origin}/pro?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pro`,
      },
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Couldn't start checkout. Try again in a minute." }, { status: 502 });
  }
}
