// Building and caching the model's tuning (server only). The daily refresh rebuilds it from every saved slip.
import { gradedPicks } from "./accuracy.ts";
import { buildCalibration, type Calibration } from "./calibration.ts";
import { kvGet, kvKeys, kvSet } from "./db.ts";
import type { SavedSlip } from "./storage.ts";

const KEY = "model:calibration";
const MEMO_MS = 10 * 60_000;
let memo: { at: number; cal: Calibration | null } | null = null;

export async function refreshCalibration(): Promise<Calibration> {
  const keys = await kvKeys("slips:");
  const lists = await Promise.all(keys.map((k) => kvGet<SavedSlip[]>(k).catch(() => null)));
  const cal = buildCalibration(gradedPicks(lists.flatMap((l) => (Array.isArray(l) ? l : []))));
  await kvSet(KEY, cal);
  memo = { at: Date.now(), cal };
  return cal;
}

/** The saved tuning, or null before the first refresh (the model then runs untuned). */
export async function loadCalibration(): Promise<Calibration | null> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.cal;
  const cal = await kvGet<Calibration>(KEY).catch(() => null);
  memo = { at: Date.now(), cal };
  return cal;
}
