"use client";
import type { Prop, StatKey } from "./types.ts";

export interface SlipLeg {
  propId: string;
  player: string;
  stat: StatKey;
  line: number;
  side: "OVER" | "UNDER";
  prob: number;
  result?: "hit" | "miss" | "push";
}

export interface SavedSlip {
  id: string;
  createdAt: string;
  entry: number;
  multiplier: number;
  legs: SlipLeg[];
}

const SLIPS = "pickslix.slips";
const CUSTOM = "pickslix.customProps";
const SYNC_CODE = "pickslix.syncCode";
const SYNCED = "pickslix.synced";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode); keep going in memory
  }
}

export const loadSlips = () => read<SavedSlip[]>(SLIPS, []);
export const saveSlips = (s: SavedSlip[]) => write(SLIPS, s);
export const loadCustomProps = () => read<Prop[]>(CUSTOM, []);
export const saveCustomProps = (p: Prop[]) => write(CUSTOM, p);

// ---------- Sync through the server database (when the deployment has one) ----------

/** This browser's sync code. Enter the same code on another device to share slips. */
export function syncCode(): string {
  let code = read<string>(SYNC_CODE, "");
  if (!code) {
    code = crypto.randomUUID();
    write(SYNC_CODE, code);
  }
  return code;
}

export function setSyncCode(code: string) {
  write(SYNC_CODE, code.trim().toLowerCase());
  write(SYNCED, false);
}

async function pushRemote(slips: SavedSlip[]) {
  await fetch("/api/slips", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: syncCode(), slips }),
  });
}

/** Save locally, then to the database in the background. */
export function persistSlips(slips: SavedSlip[]) {
  saveSlips(slips);
  pushRemote(slips).catch(() => {});
}

/**
 * Load slips from the database. The first sync on a device merges in local slips; after that the database
 * wins, so a slip deleted on one device doesn't come back from another.
 */
export async function pullSlips(): Promise<{ enabled: boolean; slips: SavedSlip[] }> {
  const local = loadSlips();
  try {
    const res = await fetch(`/api/slips?code=${encodeURIComponent(syncCode())}`, { cache: "no-store" });
    const body = (await res.json()) as { enabled?: boolean; slips?: SavedSlip[] };
    if (!res.ok || !body.enabled) return { enabled: false, slips: local };
    let slips = body.slips ?? [];
    if (!read<boolean>(SYNCED, false)) {
      const ids = new Set(slips.map((s) => s.id));
      slips = [...local.filter((s) => !ids.has(s.id)), ...slips].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      await pushRemote(slips);
      write(SYNCED, true);
    }
    saveSlips(slips);
    return { enabled: true, slips };
  } catch {
    return { enabled: false, slips: local };
  }
}
