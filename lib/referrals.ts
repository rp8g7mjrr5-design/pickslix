// Invite a friend: when someone new signs up from your invite or share link, you both get a week of Pro.
// Needs accounts, so each reward is tied to a real new sign-up.
import { getAccount, setAccountProKey, updateAccount } from "./accounts.ts";
import { kvClaim, kvGet, kvSet } from "./db.ts";
import { addTrialDays } from "./pro.ts";

export const REFERRAL_DAYS = 7;
/** Rewards one person can earn by inviting, so it stays a thank-you rather than free Pro forever. */
export const MAX_REWARDS = 12;
/** Only accounts this new count as joining from an invite. */
const NEW_ACCOUNT_MS = 3 * 86400_000;

export interface ReferralLog {
  /** Usernames (or "someone") who joined from this person's invites, newest first. */
  joined: { at: string; who: string }[];
}

const logKey = (userId: string) => `referrals:${userId}`;

/** Why this sign-up can't be rewarded, or null when it can. Pure, for the checks in claimReferral. */
export function referralProblem(o: { userId: string; referrerId: string | null; createdAt: number; alreadyReferred: boolean; rewards: number; now?: number }): string | null {
  if (!o.referrerId) return "That invite link isn't valid anymore.";
  if (o.referrerId === o.userId) return "You can't invite yourself.";
  if (o.alreadyReferred) return "You've already joined from an invite.";
  if ((o.now ?? Date.now()) - o.createdAt > NEW_ACCOUNT_MS) return "Invites are for new accounts.";
  if (o.rewards >= MAX_REWARDS) return "That invite has been used the most times it can.";
  return null;
}

async function accountCreatedAt(userId: string): Promise<number> {
  const { clerkClient } = await import("@clerk/nextjs/server");
  const user = await (await clerkClient()).users.getUser(userId);
  return Number(user.createdAt) || 0;
}

/** Give one account free Pro days, keeping its key in sync. Returns the account's Pro key when it changed. */
async function reward(userId: string): Promise<string | null> {
  const account = await getAccount(userId);
  const key = await addTrialDays(account.proKey, REFERRAL_DAYS);
  if (key && key !== account.proKey) await setAccountProKey(userId, key);
  return key;
}

/** The signed-in new user `userId` joined from `ref`'s invite: reward both. */
export async function claimReferral(userId: string, ref: string): Promise<{ ok: true; by: string; proKey: string | null } | { error: string }> {
  const name = ref.trim().replace(/^@/, "");
  const referrerId = /^[A-Za-z0-9_]{3,20}$/.test(name) ? await kvGet<string>(`username:${name.toLowerCase()}`) : null;
  const [account, log, createdAt] = await Promise.all([
    getAccount(userId),
    referrerId ? kvGet<ReferralLog>(logKey(referrerId)) : null,
    accountCreatedAt(userId).catch(() => 0),
  ]);
  const referrer = referrerId ? await getAccount(referrerId) : null;
  const problem =
    referrer?.banned ? "That invite link isn't valid anymore." :
    referralProblem({ userId, referrerId, createdAt, alreadyReferred: Boolean(account.referredBy), rewards: log?.joined.length ?? 0 });
  if (problem) return { error: problem };
  // One claim per new account, even if two tabs race.
  if (!(await kvClaim(`referred:${userId}`, referrerId))) return { error: "You've already joined from an invite." };
  await updateAccount(userId, { referredBy: referrerId! });
  const proKey = await reward(userId);
  await reward(referrerId!);
  const joined = [{ at: new Date().toISOString(), who: account.username ?? "someone" }, ...(log?.joined ?? [])];
  await kvSet(logKey(referrerId!), { joined } satisfies ReferralLog);
  return { ok: true, by: referrer?.username ?? name, proKey };
}

export async function referralStats(userId: string) {
  const log = await kvGet<ReferralLog>(logKey(userId)).catch(() => null);
  const n = log?.joined.length ?? 0;
  return { joined: n, daysEarned: Math.min(n, MAX_REWARDS) * REFERRAL_DAYS, left: Math.max(0, MAX_REWARDS - n), recent: log?.joined.slice(0, 5) ?? [] };
}
