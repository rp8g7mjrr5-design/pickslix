"use client";
import type { PayoutTiers, PlatformId, Play } from "./platforms.ts";
import type { Prop, Sport, StatKey } from "./types.ts";

export interface SlipLeg {
  propId: string;
  player: string;
  stat: StatKey;
  line: number;
  side: "OVER" | "UNDER";
  prob: number;
  /** The model's chance before tuning on graded picks (absent on older picks, which weren't tuned). */
  rawProb?: number;
  /** The sportsbooks' price for this prop when it was picked, and the last one seen before the game. */
  openPrice?: { line: number; pOver: number };
  closePrice?: { line: number; pOver: number };
  /** The model's spread-to-mean ratio for the player, to compare prices at different lines. */
  dispersion?: number;
  /** An alternate line (PrizePicks goblin or demon), which pays differently from a standard pick. */
  tier?: "below" | "above";
  result?: "hit" | "miss" | "push";
  /** What the player actually put up, when graded from the box score. */
  actual?: number;
  /** Set when the tracker graded this leg from the box score (a manual mark clears it). */
  auto?: boolean;
  sport?: Sport;
  team?: string;
  opponent?: string;
  gameTime?: string;
}

export interface SavedSlip {
  id: string;
  createdAt: string;
  entry: number;
  /** Paid when every pick hits. */
  multiplier: number;
  /** The pick'em app it was played on (absent on older slips: Pick 6). */
  platform?: PlatformId;
  play?: Play;
  /** Flex: hits → multiplier, as set when saved. */
  tiers?: PayoutTiers;
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
    window.dispatchEvent(new Event("pickslix:change"));
  } catch {
    // storage unavailable (private mode); keep going in memory
  }
}

export const loadSlips = () => read<SavedSlip[]>(SLIPS, []);
export const saveSlips = (s: SavedSlip[]) => write(SLIPS, s);
export const loadCustomProps = () => read<Prop[]>(CUSTOM, []);
/** Weekly budget for the bankroll coach, in dollars; 0 when not set. */
export const loadBudget = () => read<number>("pickslix.budget", 0);
export const saveBudget = (n: number) => write("pickslix.budget", Math.max(0, Math.round(n)));
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
export async function pullSlips(): Promise<{ enabled: boolean; slips: SavedSlip[]; account: boolean }> {
  const local = loadSlips();
  try {
    const res = await fetch(`/api/slips?code=${encodeURIComponent(syncCode())}`, { cache: "no-store" });
    const body = (await res.json()) as { enabled?: boolean; account?: boolean; owner?: string; slips?: SavedSlip[] };
    if (!res.ok || !body.enabled) return { enabled: false, slips: local, account: false };
    let slips = body.slips ?? [];
    // Who these slips belong to: a sync code, or a signed-in account. Local slips merge in once per owner.
    const owner = body.account ? `account:${body.owner ?? ""}` : `code:${syncCode()}`;
    if (read<string | boolean>(SYNCED, false) !== owner) {
      const ids = new Set(slips.map((s) => s.id));
      slips = [...local.filter((s) => !ids.has(s.id)), ...slips].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      await pushRemote(slips);
      write(SYNCED, owner);
    }
    saveSlips(slips);
    return { enabled: true, slips, account: Boolean(body.account) };
  } catch {
    return { enabled: false, slips: local, account: false };
  }
}

/** After signing out: the account's slips stay with the account, not on this device. */
export function forgetAccountSlips() {
  if (String(read<string | boolean>(SYNCED, "")).startsWith("account:")) {
    saveSlips([]);
    write(SYNCED, false);
  }
}
