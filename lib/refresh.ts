import { kvGet, kvSet } from "./db.ts";
import { computeNbaDefense, computeNflDefense, computeNhlDefense, fetchInjuries, type EspnSport } from "./espn.ts";
import { refreshNflContext } from "./nflData.ts";
import type { DefenseFactors } from "./types.ts";

interface Snapshot {
  updatedAt: string;
  factors: DefenseFactors;
}

const key = (sport: EspnSport) => `defense:${sport}`;
/** The daily cron rewrites these; older than this and a request recomputes on its own. */
const STALE_MS = 36 * 3600_000;
const inflight = new Map<EspnSport, Promise<DefenseFactors>>();

/** Recompute team defense factors and save them. `full` is the cron's deeper pass. */
export async function refreshDefense(sport: EspnSport, full = false): Promise<DefenseFactors> {
  const factors =
    sport === "NBA"
      ? await computeNbaDefense(full ? 60 : 30)
      : sport === "NHL"
        ? await computeNhlDefense(full ? 45 : 20)
        : await computeNflDefense(full ? 10 : 3);
  if (Object.keys(factors).length) {
    await kvSet(key(sport), { updatedAt: new Date().toISOString(), factors } satisfies Snapshot, 3 * 86400);
  }
  return factors;
}

/** Saved factors when fresh, otherwise a quick recompute (shared between concurrent requests). */
export async function loadDefense(sport: EspnSport): Promise<DefenseFactors> {
  // Team defense is modeled for NBA, NFL and NHL so far.
  if (sport !== "NBA" && sport !== "NFL" && sport !== "NHL") return {};
  const snap = await kvGet<Snapshot>(key(sport)).catch(() => null);
  if (snap && Date.now() - Date.parse(snap.updatedAt) < STALE_MS) return snap.factors;
  if (!inflight.has(sport)) {
    inflight.set(
      sport,
      refreshDefense(sport)
        .catch(() => snap?.factors ?? {})
        .finally(() => inflight.delete(sport)),
    );
  }
  return inflight.get(sport)!;
}

/** Cron entry point: rebuild defense for both sports and warm the injury feeds. */
export async function refreshAll() {
  const started = Date.now();
  const sports: EspnSport[] = ["NBA", "NFL", "NHL"];
  const results = await Promise.allSettled(sports.map((s) => refreshDefense(s, true)));
  const injuries = await Promise.allSettled(sports.map(fetchInjuries));
  const nfl = await refreshNflContext().then(
    (c) => (c ? `${Object.keys(c.players).length} players, ${Object.keys(c.defense).length} defenses` : "no data yet"),
    (e) => `failed: ${e}`,
  );
  return {
    tookMs: Date.now() - started,
    nflverse: nfl,
    defense: Object.fromEntries(
      sports.map((s, i) => {
        const r = results[i];
        return [s, r.status === "fulfilled" ? `${Object.keys(r.value).length} teams` : `failed: ${r.reason}`];
      }),
    ),
    injuries: Object.fromEntries(
      sports.map((s, i) => {
        const r = injuries[i];
        return [s, r.status === "fulfilled" ? `${r.value.length} players` : `failed: ${r.reason}`];
      }),
    ),
  };
}
