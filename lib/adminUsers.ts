// The admin accounts page: every Clerk user next to what LayLock knows about them, plus ban and
// free Pro. Clerk does the searching; a LayLock username typed in full finds that person too.
import { adminEmails } from "./admin.ts";
import { getAccount, updateAccount, type Account } from "./accounts.ts";
import { kvDel, kvGet, kvSet } from "./db.ts";
import { leaderStats } from "./leaderboard.ts";
import { checkPass, newKey, type ProPass } from "./pro.ts";
import type { SavedSlip } from "./storage.ts";

export const PAGE_SIZE = 25;

export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  imageUrl: string;
  createdAt: number;
  lastActiveAt: number | null;
  banned: boolean;
  admin: boolean;
  username: string | null;
  plan: ProPass["plan"] | null;
  /** True when the Pro came from the admin page, so it can be taken back here. */
  granted: boolean;
  picks: number;
  hitRate: number;
}

type ClerkUser = Awaited<ReturnType<Awaited<ReturnType<typeof clerk>>["users"]["getUser"]>>;

async function clerk() {
  const { clerkClient } = await import("@clerk/nextjs/server");
  return clerkClient();
}

async function describe(user: ClerkUser): Promise<AdminUser> {
  const account: Account = await getAccount(user.id).catch(() => ({}));
  const pass = account.proKey ? await checkPass(account.proKey).catch(() => null) : null;
  const slips = (await kvGet<SavedSlip[]>(`slips:user:${user.id}`).catch(() => null)) ?? [];
  const stats = leaderStats(slips);
  const emails = user.emailAddresses.map((e) => e.emailAddress.toLowerCase());
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  return {
    id: user.id,
    name,
    email: user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null,
    imageUrl: user.imageUrl,
    createdAt: user.createdAt,
    lastActiveAt: user.lastActiveAt ?? user.lastSignInAt,
    banned: user.banned,
    admin: emails.some((e) => adminEmails().includes(e)),
    username: account.username ?? null,
    plan: pass?.plan ?? null,
    granted: Boolean(pass?.granted),
    picks: stats.picks,
    hitRate: stats.hitRate,
  };
}

/** One page of accounts, newest first, optionally filtered by a search. */
export async function listUsers(query: string, page: number): Promise<{ users: AdminUser[]; total: number }> {
  const client = await clerk();
  const q = query.trim();
  const { data, totalCount } = await client.users.getUserList({
    query: q || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    orderBy: "-created_at",
  });
  const users = [...data];
  // Clerk doesn't know LayLock usernames, so look one up directly.
  if (q && page === 0) {
    const owner = await kvGet<string>(`username:${q.replace(/^@/, "").toLowerCase()}`).catch(() => null);
    if (owner && !users.some((u) => u.id === owner)) {
      const extra = await client.users.getUser(owner).catch(() => null);
      if (extra) users.unshift(extra);
    }
  }
  return { users: await Promise.all(users.map(describe)), total: totalCount };
}

export type UserAction = "ban" | "unban" | "grant" | "revoke";

export async function actOnUser(userId: string, action: UserAction): Promise<{ user: AdminUser } | { error: string }> {
  const client = await clerk();
  const user = await client.users.getUser(userId).catch(() => null);
  if (!user) return { error: "That account doesn't exist." };
  const account = await getAccount(userId);

  if (action === "ban") {
    if ((await describe(user)).admin) return { error: "Admins can't be banned." };
    await client.users.banUser(userId);
    await updateAccount(userId, { banned: true });
    await kvDel("leaderboard:cache").catch(() => {});
  } else if (action === "unban") {
    await client.users.unbanUser(userId);
    await updateAccount(userId, { banned: false });
    await kvDel("leaderboard:cache").catch(() => {});
  } else if (action === "grant") {
    if (account.proKey && (await checkPass(account.proKey).catch(() => null))) return { error: "They already have Pro." };
    const key = newKey();
    await kvSet(`pro:${key}`, { plan: "lifetime", createdAt: new Date().toISOString(), granted: true } satisfies ProPass);
    await updateAccount(userId, { proKey: key, linkedAt: new Date().toISOString() });
  } else if (action === "revoke") {
    const pass = account.proKey ? await kvGet<ProPass>(`pro:${account.proKey}`).catch(() => null) : null;
    if (!pass) return { error: "They don't have Pro." };
    if (pass.subscription) return { error: "That's a paid subscription. Cancel or refund it in Stripe instead." };
    await kvDel(`pro:${account.proKey}`);
    await updateAccount(userId, { proKey: undefined });
  } else return { error: "Unknown action." };

  const fresh = await client.users.getUser(userId);
  return { user: await describe(fresh) };
}
