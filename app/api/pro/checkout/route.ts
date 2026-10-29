import { NextResponse } from "next/server";
import { accountsEnabled, currentUserId, getAccount } from "@/lib/accounts.ts";
import { prices, stripe, stripeEnabled, trialDays, trialEligible } from "@/lib/pro.ts";

/** Start a Stripe Checkout for a Pro subscription. Body: { plan: "monthly" | "yearly" } → { url } */
export async function POST(req: Request) {
  if (!stripeEnabled()) return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
  const { plan } = (await req.json().catch(() => ({}))) as { plan?: string };
  const price = plan === "yearly" ? prices().yearly : prices().monthly;
  if (!price) return NextResponse.json({ error: "That plan isn't available." }, { status: 400 });
  // With accounts on, Pro is bought by an account so it can't be lost with a browser.
  const userId = await currentUserId();
  if (accountsEnabled() && !userId) return NextResponse.json({ error: "Sign in first so Pro is saved to your account." }, { status: 401 });
  const origin = new URL(req.url).origin;
  // A first-time subscriber's first week is free; Stripe charges when it ends unless they cancel.
  const trial = userId && (await trialEligible(userId, (await getAccount(userId).catch(() => ({}) as { proKey?: string })).proKey)) ? trialDays() : 0;
  try {
    const session = await stripe("/checkout/sessions", {
      form: {
        mode: "subscription",
        "line_items[0][price]": price,
        "line_items[0][quantity]": "1",
        allow_promotion_codes: "true",
        success_url: `${origin}/pro?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pro`,
        ...(userId ? { client_reference_id: userId } : {}),
        ...(trial ? { "subscription_data[trial_period_days]": String(trial) } : {}),
      },
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Couldn't start checkout. Try again in a minute." }, { status: 502 });
  }
}
