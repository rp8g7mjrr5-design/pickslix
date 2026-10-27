import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/accounts.ts";
import { accountOf, getCrew, removeMember, resetInvite } from "@/lib/crews.ts";
import { kvGet } from "@/lib/db.ts";
import { leaderStats } from "@/lib/leaderboard.ts";
import { checkPass } from "@/lib/pro.ts";
import type { SavedSlip } from "@/lib/storage.ts";

export const dynamic = "force-dynamic";

const RECENT_DAYS = 7;
const SLIPS_PER_MEMBER = 5;

type Params = { params: Promise<{ id: string }> };

/** A crew's members with their records, and their recent slips. Members only. */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  const crew = await getCrew(id);
  if (!userId || !crew || !crew.members.includes(userId)) return NextResponse.json({ error: "Crew not found." }, { status: 404 });
  const since = Date.now() - RECENT_DAYS * 86400_000;
  const members = await Promise.all(
    crew.members.map(async (memberId) => {
      const account = await accountOf(memberId);
      const slips = (await kvGet<SavedSlip[]>(`slips:user:${memberId}`).catch(() => null)) ?? [];
      const pro = account.proKey ? Boolean(await checkPass(account.proKey).catch(() => null)) : false;
      const recent = slips
        .filter((s) => Date.parse(s.createdAt) > since)
        .slice(0, SLIPS_PER_MEMBER)
        // Entry amounts stay private; the legs and results are what the crew sees.
        .map((s) => ({ id: s.id, createdAt: s.createdAt, legs: s.legs.map(({ propId: _p, auto: _a, ...l }) => l) }));
      return {
        memberId,
        username: account.username ?? "Member",
        you: memberId === userId,
        owner: memberId === crew.ownerId,
        pro,
        stats: leaderStats(slips),
        recent,
      };
    }),
  );
  members.sort((a, b) => b.stats.hitRate - a.stats.hitRate || b.stats.picks - a.stats.picks);
  return NextResponse.json({
    crew: { id: crew.id, name: crew.name, invite: crew.invite, owner: crew.ownerId === userId, createdAt: crew.createdAt },
    members,
  });
}

/** { action: "leave" } | { action: "remove", memberId } | { action: "invite" } (new invite link) */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; memberId?: string };
  const result =
    body.action === "leave"
      ? await removeMember(id, userId, userId)
      : body.action === "remove"
        ? await removeMember(id, userId, String(body.memberId ?? ""))
        : body.action === "invite"
          ? await resetInvite(id, userId)
          : { error: "Unknown action." };
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}
