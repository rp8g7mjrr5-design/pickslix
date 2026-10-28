// Shared slips: a short link anyone can open to see a slip and tail it. Kept a week.
import { kvGet, kvSet } from "./db.ts";
import type { TailLeg } from "./tail.ts";
import { MAX_PICKS } from "./format.ts";
import { SPORTS, STATS, type Sport } from "./types.ts";

export interface SharedSlip {
  id: string;
  createdAt: string;
  /** Username of whoever shared it, when signed in with one. */
  by?: string;
  legs: TailLeg[];
  /** Model's chance every leg hits, as shown when shared. */
  hit?: number;
}

const TTL = 7 * 86400;
const ID = /^[a-z0-9]{8}$/;
const key = (id: string) => `share:${id}`;

const str = (v: unknown, max = 60) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** Only the fields a slip needs, checked, so a shared page can't carry anything else. */
export function cleanLegs(raw: unknown): TailLeg[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_PICKS)
    .map((l: any): TailLeg | null => {
      if (typeof l?.player !== "string" || !(l?.stat in STATS) || !Number.isFinite(l?.line) || (l?.side !== "OVER" && l?.side !== "UNDER")) return null;
      const prob = Number(l.prob);
      return {
        player: l.player.slice(0, 60),
        stat: l.stat,
        line: Number(l.line),
        side: l.side,
        prob: prob > 0 && prob < 1 ? prob : 0.5,
        sport: SPORTS.includes(l.sport) ? (l.sport as Sport) : undefined,
        team: str(l.team, 12),
        opponent: str(l.opponent, 12),
        gameTime: str(l.gameTime, 30) && Number.isFinite(Date.parse(l.gameTime)) ? l.gameTime : undefined,
      };
    })
    .filter((l): l is TailLeg => Boolean(l));
}

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");

export async function createShare(legs: TailLeg[], by?: string, hit?: number): Promise<SharedSlip> {
  const slip: SharedSlip = { id: newId(), createdAt: new Date().toISOString(), legs, ...(by ? { by } : {}), ...(hit && hit > 0 && hit < 1 ? { hit } : {}) };
  await kvSet(key(slip.id), slip, TTL);
  return slip;
}

export async function loadShare(id: string): Promise<SharedSlip | null> {
  return ID.test(id) ? kvGet<SharedSlip>(key(id)).catch(() => null) : null;
}
