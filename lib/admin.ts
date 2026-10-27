// The site owner's account. ADMIN_EMAILS lists the emails (comma separated) whose signed-in accounts can
// open /admin to see lifetime codes, make new ones, and check how the site is doing.
import { currentUserId } from "./accounts.ts";

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** True when the signed-in user has a verified email listed in ADMIN_EMAILS. */
export async function isAdmin(): Promise<boolean> {
  const emails = adminEmails();
  if (!emails.length || !(await currentUserId())) return false;
  try {
    const { currentUser } = await import("@clerk/nextjs/server");
    const user = await currentUser();
    return Boolean(
      user?.emailAddresses.some((e) => e.verification?.status === "verified" && emails.includes(e.emailAddress.toLowerCase())),
    );
  } catch {
    return false;
  }
}
