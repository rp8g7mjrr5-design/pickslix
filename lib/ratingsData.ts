// Team ratings, rebuilt daily by the cron from ESPN's finished scoreboards and saved, like team defense.
import { kvGet, kvSet } from "./db.ts";
import { fetchResults, type EspnGame } from "./espn.ts";
import { SPORT_MODEL, fitRatings, type Ratings, type Result } from "./ratings.ts";
import type { Sport } from "./types.ts";

export const RATED_SPORTS = Object.keys(SPORT_MODEL) as Sport[];
const key = (sport: Sport) => `ratings:${sport}`;
const STALE_MS = 36 * 3600_000;
/** Days of scoreboards for the daily sports; football reads every week of the season. */
const DAYS: Partial<Record<Sport, number>> = { NBA: 60, CBB: 45, NHL: 60, MLB: 60 };
const inflight = new Map<Sport, Promise<Ratings | null>>();

export function toResults(games: EspnGame[]): Result[] {
  return games.flatMap((g) => {
    const home = g.teams.find((t) => t.home) ?? g.teams[0];
    const away = g.teams.find((t) => t !== home);
    if (!home || !away || home.score === undefined || away.score === undefined) return [];
    return [{
      date: g.date,
      neutral: g.neutral,
      home: { abbr: home.abbr, name: home.name || home.abbr, score: home.score },
      away: { abbr: away.abbr, name: away.name || away.abbr, score: away.score },
    }];
  });
}

export async function refreshRatings(sport: Sport): Promise<Ratings | null> {
  const games = await fetchResults(sport, DAYS[sport] ?? 60);
  const r = fitRatings(sport, toResults(games));
  if (r && Object.keys(r.teams).length) await kvSet(key(sport), r, 3 * 86400).catch(() => {});
  return r;
}

/** Saved ratings when fresh, otherwise rebuilt now (shared between concurrent requests). */
export async function loadRatings(sport: Sport): Promise<Ratings | null> {
  if (!SPORT_MODEL[sport]) return null;
  const saved = await kvGet<Ratings>(key(sport)).catch(() => null);
  if (saved && Date.now() - Date.parse(saved.updatedAt) < STALE_MS) return saved;
  if (!inflight.has(sport)) {
    inflight.set(
      sport,
      refreshRatings(sport)
        .catch(() => saved)
        .finally(() => inflight.delete(sport)),
    );
  }
  return inflight.get(sport)!;
}
