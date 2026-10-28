import { NextResponse } from "next/server";
import { accuracyReport, type AccuracyReport } from "@/lib/accuracy.ts";
import { kvGet, kvKeys, kvSet } from "@/lib/db.ts";
import type { SavedSlip } from "@/lib/storage.ts";

export const dynamic = "force-dynamic";

const CACHE = "accuracy:cache";
const TTL = 3600;

/** The public model report card, built from every saved slip (accounts and sync codes). Rebuilt at most hourly. */
export async function GET() {
  const cached = await kvGet<AccuracyReport & { at: string }>(CACHE).catch(() => null);
  if (cached) return NextResponse.json(cached);
  const keys = await kvKeys("slips:").catch(() => [] as string[]);
  const lists = await Promise.all(keys.map((k) => kvGet<SavedSlip[]>(k).catch(() => null)));
  const body = { ...accuracyReport(lists.flatMap((l) => (Array.isArray(l) ? l : []))), at: new Date().toISOString() };
  await kvSet(CACHE, body, TTL).catch(() => {});
  return NextResponse.json(body);
}
