import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/accounts.ts";
import { accountOf, getCrew, removeMember, resetInvite } from "@/lib/crews.ts";
import { prevWeek, standings, weekOf } from "@/lib/contest.ts";
import { kvClaim, kvGet, kvSet } from "@/lib/db.ts";
import { leaderStats } from "@/lib/leaderboard.ts";
import { checkPass, isGold } from "@/lib/pro.ts";
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
      // Banned accounts drop out of every crew's view.
      if (account.banned && memberId !== userId) return null;
      const slips = (await kvGet<SavedSlip[]>(`slips:user:${memberId}`).catch(() => null)) ?? [];
      const pass = account.proKey ? await checkPass(account.proKey).catch(() => null) : null;
      const pro = Boolean(pass);
      const gold = isGold(pass);
      const recent = slips
        .filter((s) => Date.parse(s.createdAt) > since)
        .slice(0, SLIPS_PER_MEMBER)
        // Entry amounts stay private; the legs and results are what the crew sees.
        .map((s) => ({ id: s.id, createdAt: s.createdAt, legs: s.legs.map(({ propId: _p, auto: _a, ...l }) => l) }));
      return {
        slips,
        memberId,
        username: account.username ?? "Member",
        you: memberId === userId,
        owner: memberId === crew.ownerId,
        pro,
        gold,
        stats: leaderStats(slips),
        recent,
      };
    }),
  );
  const shown = members.filter((m) => m !== null);
  shown.sort((a, b) => b.stats.hitRate - a.stats.hitRate || b.stats.picks - a.stats.picks);
  const week = weekOf(Date.now());
  const last = prevWeek(week);
  const thisWeek = standings(shown, week);
  const lastWeek = standings(shown, last);
  // Last week's winner gets the badge once.
  if (lastWeek.winner && (await kvClaim(`crewwin:${crew.id}:${last}`, lastWeek.winner.memberId, 400 * 86400).catch(() => false))) {
    const key = `crewwins:user:${lastWeek.winner.memberId}`;
    const wins = (await kvGet<{ crew: string; name: string; week: string }[]>(key).catch(() => null)) ?? [];
    await kvSet(key, [{ crew: crew.id, name: crew.name, week: last }, ...wins].slice(0, 200)).catch(() => {});
  }
  return NextResponse.json({
    crew: { id: crew.id, name: crew.name, invite: crew.invite, owner: crew.ownerId === userId, createdAt: crew.createdAt },
    members: shown.map(({ slips: _, ...m }) => m),
    week: { id: week, rows: thisWeek.rows.map(({ memberId: _, ...r }) => r), lastWinner: lastWeek.winner ? { username: lastWeek.winner.username, net: lastWeek.winner.net } : null },
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
