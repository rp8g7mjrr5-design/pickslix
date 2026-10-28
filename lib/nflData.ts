// Loading and caching the nflverse context (server only; `lib/nflverse.ts` holds the pure parts the browser uses too).
import { kvGet, kvSet } from "./db.ts";
import { buildNflContext, nflSeason, parseCsv, type NflContext } from "./nflverse.ts";

const RELEASES = "https://github.com/nflverse/nflverse-data/releases/download";
const KEY = "nfl:context";
const STALE_MS = 36 * 3600_000;
let inflight: Promise<NflContext | null> | null = null;

async function fetchText(url: string): Promise<string> {
  // Over 2 MB, too big for Next's fetch cache; the result is saved in the database instead.
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`nflverse ${res.status} for ${url}`);
  return res.text();
}

/** Download this season's files and rebuild the context (about 4 MB; the daily cron does this). */
export async function refreshNflContext(season = nflSeason()): Promise<NflContext | null> {
  const [week, snaps] = await Promise.all([
    fetchText(`${RELEASES}/stats_player/stats_player_week_${season}.csv`),
    fetchText(`${RELEASES}/snap_counts/snap_counts_${season}.csv`).catch(() => ""),
  ]);
  const ctx = buildNflContext(parseCsv(week), snaps ? parseCsv(snaps) : [], season);
  if (!Object.keys(ctx.players).length) return null;
  await kvSet(KEY, ctx, 3 * 86400).catch(() => {});
  return ctx;
}

/** Saved context when fresh, otherwise rebuilt once (shared by concurrent requests). Null when nflverse is unreachable. */
export async function loadNflContext(): Promise<NflContext | null> {
  const saved = await kvGet<NflContext>(KEY).catch(() => null);
  if (saved && Date.now() - Date.parse(saved.updatedAt) < STALE_MS) return saved;
  inflight ??= refreshNflContext()
    .catch(() => saved)
    .finally(() => (inflight = null));
  return inflight;
}

