"use client";
// Sportsbook bets in the browser, synced the same way as pick'em slips: to the account when signed in, otherwise
// under this browser's sync code.
import type { SavedBet } from "./bets.ts";
import { syncCode } from "./storage.ts";

const BETS = "laylock.bets";
const SYNCED = "laylock.betsSynced";

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
  } catch {}
}

export const loadBets = () => read<SavedBet[]>(BETS, []);

async function pushRemote(bets: SavedBet[]) {
  await fetch("/api/bets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: syncCode(), bets }) });
}

/** Save locally, then to the database in the background. */
export function persistBets(bets: SavedBet[]) {
  write(BETS, bets);
  pushRemote(bets).catch(() => {});
}

/** Load from the database; the first sync for an owner merges in this browser's bets, then the database wins. */
export async function pullBets(): Promise<SavedBet[]> {
  const local = loadBets();
  try {
    const res = await fetch(`/api/bets?code=${encodeURIComponent(syncCode())}`, { cache: "no-store" });
    const body = (await res.json()) as { enabled?: boolean; account?: boolean; owner?: string; bets?: SavedBet[] };
    if (!res.ok || !body.enabled) return local;
    let bets = body.bets ?? [];
    const owner = body.account ? `account:${body.owner ?? ""}` : `code:${syncCode()}`;
    if (read<string>(SYNCED, "") !== owner) {
      const ids = new Set(bets.map((b) => b.id));
      bets = [...local.filter((b) => !ids.has(b.id)), ...bets].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      await pushRemote(bets);
      write(SYNCED, owner);
    }
    write(BETS, bets);
    return bets;
  } catch {
    return local;
  }
}

/** Add one bet, pulling first so one saved on another device isn't overwritten. */
export async function addBet(bet: SavedBet) {
  const bets = await pullBets();
  persistBets([bet, ...bets.filter((b) => b.id !== bet.id)]);
}
