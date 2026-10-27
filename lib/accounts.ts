// Accounts via Clerk (sign in with Google, Apple or an email code). An account holds the user's Pro key
// and their saved slips, so both follow them to any device. Without Clerk's keys everything works signed out.
import { kvClaim, kvDel, kvGet, kvSet } from "./db.ts";

export const accountsEnabled = () => Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export interface Account {
  proKey?: string;
  linkedAt?: string;
  /** Public name on the leaderboard. Having one is what puts you on it. */
  username?: string;
  /** Banned by an admin: signed out by Clerk and hidden from the leaderboard and crews. */
  banned?: boolean;
}

/** The signed-in user's id, or null when signed out or accounts are off. */
export async function currentUserId(): Promise<string | null> {
  if (!accountsEnabled()) return null;
  try {
    const { auth } = await import("@clerk/nextjs/server");
    return (await auth()).userId ?? null;
  } catch {
    return null;
  }
}

const accountKey = (userId: string) => `account:${userId}`;

export const getAccount = async (userId: string) => (await kvGet<Account>(accountKey(userId))) ?? {};

export async function setAccountProKey(userId: string, proKey: string) {
  const account = await getAccount(userId);
  await kvSet(accountKey(userId), { ...account, proKey, linkedAt: new Date().toISOString() } satisfies Account);
}

export async function updateAccount(userId: string, change: Partial<Account>) {
  await kvSet(accountKey(userId), { ...(await getAccount(userId)), ...change } satisfies Account);
}

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const RESERVED = new Set(["admin", "legup", "crewcheck", "laylock", "lay_lock", "support", "official", "moderator", "staff", "draftkings", "pick6"]);
const nameKey = (name: string) => `username:${name.toLowerCase()}`;

/** Why a username can't be used, or null when it's fine to try. */
export function usernameProblem(name: string): string | null {
  if (!USERNAME.test(name)) return "Use 3 to 20 letters, numbers or underscores.";
  if (RESERVED.has(name.toLowerCase())) return "That name is reserved.";
  return null;
}

/** Claim a username for this account (or clear it with ""), releasing the old one. */
export async function setUsername(userId: string, raw: string): Promise<{ username: string | null } | { error: string }> {
  const name = raw.trim();
  const account = await getAccount(userId);
  if (name) {
    const problem = usernameProblem(name);
    if (problem) return { error: problem };
    if (account.username?.toLowerCase() !== name.toLowerCase()) {
      const owner = await kvGet<string>(nameKey(name));
      if (owner && owner !== userId) return { error: "That username is taken." };
      if (!owner && !(await kvClaim(nameKey(name), userId))) return { error: "That username is taken." };
    }
  }
  if (account.username && account.username.toLowerCase() !== name.toLowerCase()) await kvDel(nameKey(account.username));
  await kvSet(accountKey(userId), { ...account, username: name || undefined } satisfies Account);
  return { username: name || null };
}
