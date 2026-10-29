import { NextResponse } from "next/server";
import { currentUserId, getAccount } from "@/lib/accounts.ts";
import { adminCodes, lifetimeCodes, planPrices, prices, proRequired, stripeEnabled, trialDays, trialEligible } from "@/lib/pro.ts";

export const dynamic = "force-dynamic";

/** What the Pro page can offer on this deployment. */
export async function GET() {
  const p = prices();
  const amounts = await planPrices().catch(() => ({ monthly: null, yearly: null }));
  const madeCodes = (await adminCodes().catch(() => [])).length > 0;
  const userId = await currentUserId().catch(() => null);
  const proKey = userId ? (await getAccount(userId).catch(() => ({}) as { proKey?: string })).proKey : undefined;
  const trial = stripeEnabled() && (await trialEligible(userId, proKey).catch(() => false)) ? trialDays() : 0;
  return NextResponse.json({
    required: proRequired(),
    checkout: stripeEnabled() && Boolean(p.monthly || p.yearly),
    monthly: stripeEnabled() && Boolean(p.monthly),
    yearly: stripeEnabled() && Boolean(p.yearly),
    codes: lifetimeCodes().length > 0 || madeCodes,
    amounts,
    monthlyLabel: process.env.NEXT_PUBLIC_PRO_MONTHLY_LABEL || null,
    yearlyLabel: process.env.NEXT_PUBLIC_PRO_YEARLY_LABEL || null,
    // Free days this visitor would get at checkout (0 when signed out, or they've subscribed before).
    trialDays: trial,
    // Signed out, a first-time buyer would still get the trial once signed in.
    trialOnSignIn: !userId && stripeEnabled() ? trialDays() : 0,
  });
}
