import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/accounts.ts";
import { createCrew, getCrew, joinCrew, myCrewIds } from "@/lib/crews.ts";

export const dynamic = "force-dynamic";

/** The signed-in user's crews. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ signedIn: false, crews: [] });
  const crews = (await Promise.all((await myCrewIds(userId)).map(getCrew))).filter((c) => c?.members.includes(userId));
  return NextResponse.json({
    signedIn: true,
    crews: crews.map((c) => ({ id: c!.id, name: c!.name, members: c!.members.length, owner: c!.ownerId === userId })),
  });
}

/** { action: "create", name } or { action: "join", invite } → { crew: { id, name } } or { error } */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; name?: string; invite?: string };
  const result =
    body.action === "create"
      ? await createCrew(userId, String(body.name ?? "").slice(0, 60))
      : body.action === "join"
        ? await joinCrew(userId, String(body.invite ?? "").slice(0, 200))
        : { error: "Unknown action." };
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ crew: { id: result.id, name: result.name } });
}
