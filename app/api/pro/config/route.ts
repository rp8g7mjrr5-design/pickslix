import { NextResponse } from "next/server";
import { lifetimeCodes, prices, proRequired, stripeEnabled } from "@/lib/pro.ts";

export const dynamic = "force-dynamic";

/** What the Pro page can offer on this deployment. */
export async function GET() {
  const p = prices();
  return NextResponse.json({
    required: proRequired(),
    checkout: stripeEnabled() && Boolean(p.monthly || p.yearly),
    monthly: stripeEnabled() && Boolean(p.monthly),
    yearly: stripeEnabled() && Boolean(p.yearly),
    codes: lifetimeCodes().length > 0,
    monthlyLabel: process.env.NEXT_PUBLIC_PRO_MONTHLY_LABEL || null,
    yearlyLabel: process.env.NEXT_PUBLIC_PRO_YEARLY_LABEL || null,
  });
}
