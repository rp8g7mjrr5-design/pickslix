// Accounts via Clerk (sign in with Google, Apple or an email code). An account holds the user's Pro key
// and their saved slips, so both follow them to any device. Without Clerk's keys everything works signed out.
import { kvGet, kvSet } from "./db.ts";

export const accountsEnabled = () => Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export interface Account {
  proKey?: string;
  linkedAt?: string;
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
