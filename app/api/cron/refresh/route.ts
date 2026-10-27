import { NextResponse } from "next/server";
import { refreshAll } from "@/lib/refresh.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily refresh (see vercel.json): rebuilds NBA and NFL team defense from box scores and saves it, so page
 * loads don't have to. Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await refreshAll());
}
