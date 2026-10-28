import { NextResponse } from "next/server";
import { adminCodes, lifetimeCodes, planPrices, prices, proRequired, stripeEnabled } from "@/lib/pro.ts";

export const dynamic = "force-dynamic";

/** What the Pro page can offer on this deployment. */
export async function GET() {
  const p = prices();
  const amounts = await planPrices().catch(() => ({ monthly: null, yearly: null }));
  const madeCodes = (await adminCodes().catch(() => [])).length > 0;
  return NextResponse.json({
    required: proRequired(),
    checkout: stripeEnabled() && Boolean(p.monthly || p.yearly),
    monthly: stripeEnabled() && Boolean(p.monthly),
    yearly: stripeEnabled() && Boolean(p.yearly),
    codes: lifetimeCodes().length > 0 || madeCodes,
    amounts,
    monthlyLabel: process.env.NEXT_PUBLIC_PRO_MONTHLY_LABEL || null,
    yearlyLabel: process.env.NEXT_PUBLIC_PRO_YEARLY_LABEL || null,
  });
}
