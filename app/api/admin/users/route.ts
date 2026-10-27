import { NextResponse } from "next/server";
import { accountsEnabled } from "@/lib/accounts.ts";
import { isAdmin } from "@/lib/admin.ts";
import { actOnUser, listUsers, PAGE_SIZE, type UserAction } from "@/lib/adminUsers.ts";

export const dynamic = "force-dynamic";

const denied = () => NextResponse.json({ error: "Admins only." }, { status: 403 });
const ACTIONS: UserAction[] = ["ban", "unban", "grant", "revoke"];

/** ?q=search&page=0 → one page of accounts. */
export async function GET(req: Request) {
  if (!accountsEnabled() || !(await isAdmin())) return denied();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 100);
  const page = Math.max(0, Math.floor(Number(url.searchParams.get("page")) || 0));
  try {
    return NextResponse.json({ ...(await listUsers(q, page)), pageSize: PAGE_SIZE });
  } catch {
    return NextResponse.json({ error: "Couldn't load accounts from Clerk." }, { status: 502 });
  }
}

/** { userId, action: "ban" | "unban" | "grant" | "revoke" } */
export async function POST(req: Request) {
  if (!accountsEnabled() || !(await isAdmin())) return denied();
  const body = (await req.json().catch(() => ({}))) as { userId?: string; action?: string };
  const userId = String(body.userId ?? "");
  const action = body.action as UserAction;
  if (!/^user_[A-Za-z0-9]+$/.test(userId) || !ACTIONS.includes(action)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  try {
    const result = await actOnUser(userId, action);
    if ("error" in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Clerk didn't accept that. Try again." }, { status: 502 });
  }
}
