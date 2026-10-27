import { NextResponse } from "next/server";
import type { Account } from "@/lib/accounts.ts";
import { kvGet, kvKeys, kvSet } from "@/lib/db.ts";
import { leaderStats, MIN_PICKS, rank, type LeaderSlip, type LeaderStats } from "@/lib/leaderboard.ts";
import { checkPass } from "@/lib/pro.ts";

export const dynamic = "force-dynamic";

const CACHE = "leaderboard:cache";
const TTL = 10 * 60;

type Row = LeaderStats & { username: string; pro: boolean };

/** Everyone with a username, ranked from their graded slips. Rebuilt at most every 10 minutes. */
export async function GET() {
  const cached = await kvGet<{ rows: Row[]; at: string }>(CACHE).catch(() => null);
  if (cached) return NextResponse.json({ ...cached, minPicks: MIN_PICKS });
  const keys = await kvKeys("account:").catch(() => [] as string[]);
  const rows: Row[] = [];
  await Promise.all(
    keys.map(async (k) => {
      const account = await kvGet<Account>(k).catch(() => null);
      if (!account?.username) return;
      const userId = k.slice("account:".length);
      const slips = (await kvGet<LeaderSlip[]>(`slips:user:${userId}`).catch(() => null)) ?? [];
      const pro = account.proKey ? Boolean(await checkPass(account.proKey).catch(() => null)) : false;
      rows.push({ username: account.username, pro, ...leaderStats(slips) });
    }),
  );
  const body = { rows: rank(rows).slice(0, 100), at: new Date().toISOString() };
  await kvSet(CACHE, body, TTL).catch(() => {});
  return NextResponse.json({ ...body, minPicks: MIN_PICKS });
}
