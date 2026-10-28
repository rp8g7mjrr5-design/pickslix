import { currentUserId } from "@/lib/accounts.ts";
import type { Owner } from "@/lib/alertsData.ts";

const CODE = /^[a-z0-9-]{12,64}$/;

/** Signed in: the account. Signed out: the browser's sync code (its slips are stored under it). */
export async function ownerFrom(code: unknown): Promise<Owner | null> {
  const user = await currentUserId();
  if (user) return { user };
  return typeof code === "string" && CODE.test(code) ? { code } : null;
}
