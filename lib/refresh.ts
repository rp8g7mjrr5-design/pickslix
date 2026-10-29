import { kvGet, kvSet } from "./db.ts";
import { refreshCalibration } from "./calibrationData.ts";
import { computeCbbDefense, computeCfbDefense, computeNbaDefense, computeNflDefense, computeNhlDefense, fetchInjuries, type EspnSport } from "./espn.ts";
import { refreshNflContext } from "./nflData.ts";
import { refreshUfcFights } from "./ufcData.ts";
import { RATED_SPORTS, refreshRatings } from "./ratingsData.ts";
import type { DefenseFactors } from "./types.ts";

interface Snapshot {
  updatedAt: string;
  factors: DefenseFactors;
}

const key = (sport: EspnSport) => `defense:${sport}`;
export const DEFENSE_SPORTS: EspnSport[] = ["NBA", "NFL", "NHL", "CFB", "CBB"];
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
        : sport === "CBB"
          ? await computeCbbDefense(full ? 30 : 14)
          : sport === "CFB"
            ? await computeCfbDefense(full ? 4 : 2)
            : await computeNflDefense(full ? 10 : 3);
  if (Object.keys(factors).length) {
    await kvSet(key(sport), { updatedAt: new Date().toISOString(), factors } satisfies Snapshot, 3 * 86400);
  }
  return factors;
}

/** Saved factors when fresh, otherwise a quick recompute (shared between concurrent requests). */
export async function loadDefense(sport: EspnSport): Promise<DefenseFactors> {
  // Team defense is modeled for NBA, NFL, NHL and college so far (college teams are keyed "CBB:DUKE").
  if (!DEFENSE_SPORTS.includes(sport)) return {};
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
  // College in a second wave: each walks a lot of scoreboards and box scores.
  const college = await Promise.allSettled((["CBB", "CFB"] as EspnSport[]).map((s) => refreshDefense(s, true)));
  const injuries = await Promise.allSettled(sports.map(fetchInjuries));
  const nfl = await refreshNflContext().then(
    (c) => (c ? `${Object.keys(c.players).length} players, ${Object.keys(c.defense).length} defenses` : "no data yet"),
    (e) => `failed: ${e}`,
  );
  const rated = await Promise.allSettled(RATED_SPORTS.map(refreshRatings));
  const ufc = await refreshUfcFights().then((f) => `${f.size} fights`, (e) => `failed: ${e}`);
  const calibration = await refreshCalibration().then(
    (c) => `${c.all.n} graded picks, a=${c.all.a.toFixed(2)} b=${c.all.b.toFixed(2)}`,
    (e) => `failed: ${e}`,
  );
  return {
    tookMs: Date.now() - started,
    nflverse: nfl,
    ufc,
    ratings: Object.fromEntries(
      RATED_SPORTS.map((s, i) => {
        const r = rated[i];
        return [s, r.status === "fulfilled" ? `${Object.keys(r.value?.teams ?? {}).length} teams` : `failed: ${r.reason}`];
      }),
    ),
    calibration,
    defense: Object.fromEntries(
      [...sports, "CBB", "CFB"].map((s, i) => {
        const r = [...results, ...college][i];
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
