// Player prop lines from The Odds API (needs ODDS_API_KEY). DraftKings Pick 6 lines come first; when
// Pick 6 hasn't posted a player, the median line across a few sportsbooks stands in.
// Each event-odds call costs one credit per market requested, so credits are spent as sparingly as possible:
// only the most-played markets are requested, only for games that haven't started, only when someone opens
// that game, and the result is cached in the database for everyone for hours. Fetching also stops before the
// monthly credits run out, so the last few are never wasted on errors.
import { kvGet, kvSet } from "./db.ts";
import { normName } from "./names.ts";
import type { Sport, StatKey } from "./types.ts";

export const oddsEnabled = () => Boolean(process.env.ODDS_API_KEY);

const BASE = "https://api.the-odds-api.com/v4";
const SPORT_KEYS: Record<Sport, string> = {
  NBA: "basketball_nba",
  NFL: "americanfootball_nfl",
  NHL: "icehockey_nhl",
  MLB: "baseball_mlb",
};
/** Pick 6 first; the rest only fill gaps. Up to 10 bookmakers cost the same as one region. */
const BOOKS = ["pick6", "draftkings", "fanduel", "betmgm", "caesars", "prizepicks"];
const BOOK_NAMES: Record<string, string> = {
  pick6: "Pick 6",
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  caesars: "Caesars",
  prizepicks: "PrizePicks",
};

/** Odds API market key → our stat. */
export const MARKETS: Record<Sport, Partial<Record<string, StatKey>>> = {
  NBA: {
    player_points: "PTS",
    player_rebounds: "REB",
    player_assists: "AST",
    player_threes: "3PM",
    player_points_rebounds_assists: "PRA",
    player_points_rebounds: "PR",
    player_points_assists: "PA",
    player_rebounds_assists: "RA",
  },
  NFL: {
    player_pass_yds: "PASS_YDS",
    player_pass_tds: "PASS_TD",
    player_pass_attempts: "PASS_ATT",
    player_rush_yds: "RUSH_YDS",
    player_receptions: "REC",
    player_reception_yds: "REC_YDS",
    player_rush_reception_yds: "RUSH_REC_YDS",
  },
  NHL: {
    player_points: "NHL_PTS",
    player_goals: "GOALS",
    player_assists: "NHL_AST",
    player_shots_on_goal: "SOG",
    player_total_saves: "SAVES",
  },
  MLB: {
    batter_hits: "HITS",
    batter_total_bases: "TB",
    batter_hits_runs_rbis: "HRR",
    batter_runs_scored: "RUNS",
    batter_rbis: "RBI",
    pitcher_strikeouts: "K",
    pitcher_hits_allowed: "HITS_ALLOWED",
    pitcher_outs: "OUTS",
  },
};

/**
 * The markets actually requested: the stats people play most. Each costs a credit per game, so the rest
 * (combos like PR/PA/RA, pass attempts, goals...) start at the season average instead. MARKETS above
 * still reads any of them a response happens to include.
 */
export const FETCH_MARKETS: Record<Sport, string[]> = {
  NBA: ["player_points", "player_rebounds", "player_assists", "player_threes", "player_points_rebounds_assists"],
  NFL: ["player_pass_yds", "player_rush_yds", "player_receptions", "player_reception_yds"],
  NHL: ["player_points", "player_shots_on_goal", "player_total_saves"],
  MLB: ["batter_hits", "batter_total_bases", "batter_hits_runs_rbis", "pitcher_strikeouts"],
};

/** Lines barely move before a game, so one fetch serves everyone for this long. */
const LINES_TTL = 6 * 3600;
const EVENTS_TTL = 30 * 60;
/** Credits kept back so a nearly empty month doesn't end in failed, wasted calls. */
const CREDIT_RESERVE = 5;
const PAUSE_KEY = "odds:paused";

export interface OddsLine {
  line: number;
  /** Who posted it: "Pick 6", or the sportsbook the line came from. */
  book: string;
}

/** normName(player) → stat → line */
export type GameLines = Record<string, Partial<Record<StatKey, OddsLine>>>;

export interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

async function oddsJson(path: string, revalidate: number): Promise<any> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}apiKey=${process.env.ODDS_API_KEY}`, { next: { revalidate } } as RequestInit);
  if (res.status === 401 || res.status === 429) {
    // Out of credits (or rate limited): stop asking for an hour instead of failing on every game opened.
    await kvSet(PAUSE_KEY, { status: res.status, at: new Date().toISOString() }, 3600).catch(() => {});
  }
  if (!res.ok) throw new Error(`Odds API ${res.status} for ${path}`);
  // Credits left this month, for the setup page.
  const remaining = res.headers.get("x-requests-remaining");
  if (remaining !== null) kvSet("odds:remaining", { remaining: Number(remaining), at: new Date().toISOString() }).catch(() => {});
  return res.json();
}

/** "Boston Red Sox" is the team ESPN calls "Red Sox"; "Los Angeles Clippers" is "Clippers". */
export const sameTeam = (full: string, short: string) => {
  const [f, t] = [normName(full), normName(short)];
  return Boolean(t) && (f === t || f.endsWith(` ${t}`));
};

/** The listed event for these teams nearest the given start time. Teams are ESPN short names. */
export function matchEvent(events: OddsEvent[], home: string, away: string, date: string): OddsEvent | undefined {
  const t = Date.parse(date);
  return events
    .filter((e) => sameTeam(e.home_team, home) && sameTeam(e.away_team, away))
    .sort((x, y) => Math.abs(Date.parse(x.commence_time) - t) - Math.abs(Date.parse(y.commence_time) - t))[0];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

/** Read the event-odds response into one line per player and stat. */
export function parseEventLines(json: any, sport: Sport): GameLines {
  const byKey = new Map<string, { player: string; stat: StatKey; pick6?: number; books: { book: string; point: number }[] }>();
  for (const bm of json?.bookmakers ?? []) {
    const book = String(bm?.key ?? "");
    for (const m of bm?.markets ?? []) {
      const stat = MARKETS[sport][m?.key];
      if (!stat) continue;
      for (const o of m?.outcomes ?? []) {
        // Over and Under share the point; reading Over (or the lone outcome DFS books sometimes send) is enough.
        if (String(o?.name).toLowerCase() === "under") continue;
        const player = String(o?.description ?? "").trim();
        const point = Number(o?.point);
        if (!player || !Number.isFinite(point)) continue;
        const key = `${normName(player)}|${stat}`;
        const entry = byKey.get(key) ?? { player, stat, books: [] };
        if (book === "pick6") entry.pick6 ??= point;
        else if (!entry.books.some((b) => b.book === book)) entry.books.push({ book, point });
        byKey.set(key, entry);
      }
    }
  }
  const out: GameLines = {};
  for (const e of byKey.values()) {
    let line: OddsLine | undefined;
    if (e.pick6 !== undefined) line = { line: e.pick6, book: "Pick 6" };
    else if (e.books.length) {
      const point = median(e.books.map((b) => b.point));
      const from = BOOKS.find((k) => e.books.some((b) => b.book === k && b.point === point)) ?? e.books[0].book;
      line = { line: point, book: BOOK_NAMES[from] ?? from };
    }
    if (line) (out[normName(e.player)] ??= {})[e.stat] = line;
  }
  return out;
}

/** Can we afford a call costing this many credits right now? */
async function canSpend(cost: number): Promise<boolean> {
  if (await kvGet(PAUSE_KEY).catch(() => null)) return false;
  const left = await kvGet<{ remaining: number }>("odds:remaining").catch(() => null);
  return !left || left.remaining - cost >= CREDIT_RESERVE;
}

/** Lines for one game, found by team names and start time. Empty when the game isn't listed yet. */
export async function fetchGameLines(sport: Sport, home: string, away: string, date: string): Promise<GameLines> {
  // Once a game starts, Pick 6 has closed it: don't spend credits on it.
  if (Date.parse(date) < Date.now()) return {};
  const key = SPORT_KEYS[sport];
  // The events list is free, but cache it anyway to keep calls down.
  const eventsKey = `odds:events:${sport}`;
  let events = await kvGet<OddsEvent[]>(eventsKey).catch(() => null);
  if (!events) {
    if (await kvGet(PAUSE_KEY).catch(() => null)) return {};
    events = (await oddsJson(`/sports/${key}/events`, EVENTS_TTL)) as OddsEvent[];
    await kvSet(eventsKey, events, EVENTS_TTL).catch(() => {});
  }
  const event = matchEvent(events, home, away, date);
  if (!event) return {};

  const cacheKey = `odds:lines:${event.id}`;
  const cached = await kvGet<GameLines>(cacheKey).catch(() => null);
  if (cached) return cached;
  const markets = FETCH_MARKETS[sport];
  if (!(await canSpend(markets.length))) return {};
  const json = await oddsJson(
    `/sports/${key}/events/${event.id}/odds?bookmakers=${BOOKS.join(",")}&markets=${markets.join(",")}&oddsFormat=american`,
    LINES_TTL,
  );
  const lines = parseEventLines(json, sport);
  await kvSet(cacheKey, lines, LINES_TTL).catch(() => {});
  return lines;
}
