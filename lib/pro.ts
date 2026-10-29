// LayLock Pro without accounts: buying (or redeeming a lifetime code) issues a Pro key, which the
// browser keeps and can be typed into any other device. Keys live in the database; subscription keys
// are re-checked against Stripe now and then, so a cancelled subscription stops working on its own.
import { kvClaim, kvGet, kvSet } from "./db.ts";

export interface ProPass {
  /** "trial" is free Pro until `until`, earned by inviting friends. */
  plan: "monthly" | "yearly" | "lifetime" | "trial";
  createdAt: string;
  /** Stripe ids for subscription passes. */
  customer?: string;
  subscription?: string;
  /** Last known Stripe status and when we checked it. */
  status?: string;
  checkedAt?: string;
  /** The lifetime code it came from. */
  code?: string;
  /** Given by an admin from the accounts page. */
  granted?: boolean;
  /** When a trial pass runs out. */
  until?: string;
}

const STRIPE = "https://api.stripe.com/v1";
const RECHECK_MS = 6 * 3600_000;
const ACTIVE = new Set(["active", "trialing", "past_due"]);

export const stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

/** Lifetime codes from LIFETIME_CODES (comma separated). Each works once. */
export const lifetimeCodes = () =>
  (process.env.LIFETIME_CODES ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

/** Pro features are only locked once there's a way to get Pro. Before that, everyone gets everything. */
export const proRequired = () => stripeEnabled() || lifetimeCodes().length > 0;

export const prices = () => ({
  monthly: process.env.STRIPE_PRICE_MONTHLY || undefined,
  yearly: process.env.STRIPE_PRICE_YEARLY || undefined,
});

const KEY_RE = /^LEG(-[A-Z0-9]{4}){3}$/;
const passKey = (key: string) => `pro:${key}`;

export function newKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return `LEG-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export const normalizeKey = (key: string) => key.trim().toUpperCase();

export async function stripe(path: string, init: { method?: string; form?: Record<string, string> } = {}): Promise<any> {
  const res = await fetch(`${STRIPE}${path}`, {
    method: init.method ?? (init.form ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(init.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init.form ? new URLSearchParams(init.form).toString() : undefined,
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${body?.error?.message ?? path}`);
  return body;
}

/** Is this key a working Pro pass right now? Subscriptions are re-checked with Stripe every few hours. */
export async function checkPass(rawKey: string | null | undefined): Promise<ProPass | null> {
  const key = normalizeKey(rawKey ?? "");
  if (!KEY_RE.test(key)) return null;
  const pass = await kvGet<ProPass>(passKey(key)).catch(() => null);
  if (!pass) return null;
  if (pass.plan === "lifetime") return pass;
  if (pass.plan === "trial") return Date.parse(pass.until ?? "") > Date.now() ? pass : null;
  if (!pass.subscription || !stripeEnabled()) return null;
  if (!pass.checkedAt || Date.now() - Date.parse(pass.checkedAt) > RECHECK_MS) {
    try {
      const sub = await stripe(`/subscriptions/${encodeURIComponent(pass.subscription)}`);
      pass.status = String(sub?.status ?? "");
      pass.checkedAt = new Date().toISOString();
      await kvSet(passKey(key), pass);
    } catch {
      // Stripe unreachable: trust the last known status.
    }
  }
  return ACTIVE.has(pass.status ?? "") ? pass : null;
}

export interface PlanPrice {
  /** In the smallest currency unit, as Stripe gives it. */
  amount: number;
  currency: string;
}

/** Monthly and yearly prices from Stripe, cached for an hour, so the Pro page can show the yearly savings. */
export async function planPrices(): Promise<{ monthly: PlanPrice | null; yearly: PlanPrice | null }> {
  const none = { monthly: null, yearly: null };
  if (!stripeEnabled()) return none;
  const cached = await kvGet<{ monthly: PlanPrice | null; yearly: PlanPrice | null }>("stripe:prices").catch(() => null);
  if (cached) return cached;
  const one = async (id?: string): Promise<PlanPrice | null> => {
    if (!id) return null;
    const p = await stripe(`/prices/${encodeURIComponent(id)}`).catch(() => null);
    return typeof p?.unit_amount === "number" ? { amount: p.unit_amount, currency: String(p.currency ?? "usd") } : null;
  };
  const ids = prices();
  const result = { monthly: await one(ids.monthly), yearly: await one(ids.yearly) };
  await kvSet("stripe:prices", result, 3600).catch(() => {});
  return result;
}

const DAY_MS = 86400_000;

/** A trial that's still running is extended from its end; otherwise it starts now. */
export function extendUntil(until: string | undefined, days: number, now = Date.now()): string {
  const from = Math.max(now, Date.parse(until ?? "") || 0);
  return new Date(from + days * DAY_MS).toISOString();
}

/**
 * Add free Pro days to `key`'s trial pass, or start a new trial pass when there isn't one. A paid or lifetime pass
 * that's working is left alone (it's already Pro). Returns the trial's key, or null when nothing changed.
 */
export async function addTrialDays(key: string | undefined, days: number): Promise<string | null> {
  const current = key ? await kvGet<ProPass>(passKey(normalizeKey(key))).catch(() => null) : null;
  if (key && current?.plan === "trial") {
    await kvSet(passKey(normalizeKey(key)), { ...current, until: extendUntil(current.until, days) } satisfies ProPass);
    return normalizeKey(key);
  }
  if (key && (await checkPass(key))) return null;
  const fresh = newKey();
  await kvSet(passKey(fresh), { plan: "trial", createdAt: new Date().toISOString(), until: extendUntil(undefined, days) } satisfies ProPass);
  return fresh;
}

/** Yearly and lifetime members get the gold badge on the leaderboard and in crews. */
export const isGold = (pass: ProPass | null | undefined) => pass?.plan === "yearly" || pass?.plan === "lifetime";

/** Turn a finished Checkout session into a Pro key. Calling it again for the same session returns the same key. */
export async function claimCheckout(sessionId: string): Promise<{ key: string; pass: ProPass } | null> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return null;
  const existing = await kvGet<string>(`checkout:${sessionId}`);
  if (existing) {
    const pass = await kvGet<ProPass>(passKey(existing));
    return pass ? { key: existing, pass } : null;
  }
  const session = await stripe(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (session?.status !== "complete" || !session?.subscription) return null;
  const key = newKey();
  if (!(await kvClaim(`checkout:${sessionId}`, key))) return claimCheckout(sessionId);
  const sub = await stripe(`/subscriptions/${encodeURIComponent(session.subscription)}`);
  const interval = sub?.items?.data?.[0]?.price?.recurring?.interval;
  const pass: ProPass = {
    plan: interval === "year" ? "yearly" : "monthly",
    createdAt: new Date().toISOString(),
    customer: String(session.customer ?? ""),
    subscription: String(session.subscription),
    status: String(sub?.status ?? "active"),
    checkedAt: new Date().toISOString(),
  };
  await kvSet(passKey(key), pass);
  // Keep the key on the subscription too, so it can be looked up from the Stripe dashboard if someone loses it.
  await stripe(`/subscriptions/${encodeURIComponent(pass.subscription!)}`, { form: { "metadata[pro_key]": key } }).catch(() => {});
  return { key, pass };
}

/** Lifetime codes made on the admin page, kept in the database next to the LIFETIME_CODES ones. */
export interface AdminCode {
  code: string;
  createdAt: string;
  note?: string;
}
export const ADMIN_CODES = "admin:codes";
export const adminCodes = async () => (await kvGet<AdminCode[]>(ADMIN_CODES).catch(() => null)) ?? [];

export function newLifetimeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chars = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => alphabet[b % alphabet.length]).join("");
  return `LIFE-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Redeem a lifetime code. Each code works once. */
export async function redeemCode(rawCode: string): Promise<{ key: string } | { error: string }> {
  const code = rawCode.trim().toUpperCase();
  if (!lifetimeCodes().includes(code) && !(await adminCodes()).some((c) => c.code === code)) return { error: "That code isn't valid." };
  const key = newKey();
  if (!(await kvClaim(`code:${code}`, key))) return { error: "That code has already been used." };
  await kvSet(passKey(key), { plan: "lifetime", createdAt: new Date().toISOString(), code } satisfies ProPass);
  return { key };
}

/** Days free before the first charge on a new subscription (PRO_TRIAL_DAYS, default 7; 0 turns it off). */
export function trialDays(): number {
  const n = Number(process.env.PRO_TRIAL_DAYS ?? 7);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

const trialUsedKey = (userId: string) => `trialused:${userId}`;

/**
 * One free trial per account, and only for accounts that never paid: a free week from invites doesn't count.
 * Signed-out buyers can't be told apart, so they don't get one.
 */
export async function trialEligible(userId: string | null, proKey?: string): Promise<boolean> {
  if (!userId || !trialDays()) return false;
  if (await kvGet(trialUsedKey(userId)).catch(() => null)) return false;
  const pass = proKey ? await kvGet<ProPass>(passKey(proKey)).catch(() => null) : null;
  return !pass || pass.plan === "trial";
}

export const markTrialUsed = (userId: string) => kvSet(trialUsedKey(userId), new Date().toISOString());
