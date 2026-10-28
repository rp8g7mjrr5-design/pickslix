import { NextResponse } from "next/server";
import { accountsEnabled, currentUserId } from "@/lib/accounts.ts";
import { proRequired } from "@/lib/pro.ts";
import { claimReferral, referralStats, REFERRAL_DAYS } from "@/lib/referrals.ts";

export const dynamic = "force-dynamic";

const on = () => accountsEnabled() && proRequired();

/** How many friends joined from the signed-in user's invites. */
export async function GET() {
  if (!on()) return NextResponse.json({ enabled: false });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ enabled: true, signedIn: false, days: REFERRAL_DAYS });
  return NextResponse.json({ enabled: true, signedIn: true, days: REFERRAL_DAYS, ...(await referralStats(userId)) });
}

/** A new account joined from an invite. Body: { ref: username } → { ok, by, proKey } or { error } */
export async function POST(req: Request) {
  if (!on()) return NextResponse.json({ error: "Invites aren't on for this site." }, { status: 404 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { ref } = (await req.json().catch(() => ({}))) as { ref?: string };
  try {
    const r = await claimReferral(userId, String(ref ?? ""));
    return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Couldn't apply the invite. Try again in a minute." }, { status: 502 });
  }
}
