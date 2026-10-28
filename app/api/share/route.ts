import { NextResponse } from "next/server";
import { currentUserId, getAccount } from "@/lib/accounts.ts";
import { dbEnabled } from "@/lib/db.ts";
import { cleanLegs, createShare } from "@/lib/share.ts";

/** Make a share link for a slip, or a recap of a settled one. Body: { legs, hit?, recap? } → { id, url } */
export async function POST(req: Request) {
  // On Vercel, links need the database to outlive one server; locally the in-memory store is fine.
  if (!dbEnabled() && process.env.VERCEL) return NextResponse.json({ error: "Sharing needs the database set up." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { legs?: unknown; hit?: unknown; recap?: unknown };
  const legs = cleanLegs(body.legs);
  if (!legs.length) return NextResponse.json({ error: "Nothing to share." }, { status: 400 });
  const userId = await currentUserId();
  const account = userId ? await getAccount(userId).catch(() => null) : null;
  const slip = await createShare(legs, account && !account.banned ? account.username : undefined, Number(body.hit), body.recap === true);
  return NextResponse.json({ id: slip.id, url: `${new URL(req.url).origin}/s/${slip.id}` });
}
