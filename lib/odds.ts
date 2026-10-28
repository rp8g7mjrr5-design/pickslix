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
  CFB: "americanfootball_ncaaf",
  CBB: "basketball_ncaab",
  UFC: "mma_mixed_martial_arts",
};
/**
 * Pick 6 first; the rest fill gaps and price the market. Up to 10 bookmakers cost the same as one region, so
 * Pinnacle and BetOnline (the sharpest books the API carries) ride along for free.
 */
const BOOKS = ["pick6", "draftkings", "fanduel", "betmgm", "caesars", "pinnacle", "betonlineag", "prizepicks"];
/** Books whose prices move first when sharp money comes in; they count double in the market price. */
const SHARP_BOOKS = new Set(["pinnacle", "betonlineag"]);
/** Pick'em apps post lines without prices, so they can't be de-vigged. */
const NO_PRICE_BOOKS = new Set(["pick6", "prizepicks"]);
const BOOK_NAMES: Record<string, string> = {
  pick6: "Pick 6",
  pinnacle: "Pinnacle",
  betonlineag: "BetOnline",
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
  CFB: {},
  CBB: {},
  UFC: {},
};
MARKETS.CFB = MARKETS.NFL;
MARKETS.CBB = MARKETS.NBA;

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
  // Books post far fewer college props, mostly the big yardage and scoring lines.
  CFB: ["player_pass_yds", "player_rush_yds", "player_reception_yds"],
  CBB: ["player_points", "player_rebounds", "player_assists"],
  // The API carries no UFC fighter props.
  UFC: [],
};

/** Lines barely move before a game, so one fetch serves everyone for this long. */
const LINES_TTL = 6 * 3600;
const EVENTS_TTL = 30 * 60;
const OPENERS_TTL = 5 * 86400;
/** Credits kept back so a nearly empty month doesn't end in failed, wasted calls. */
const CREDIT_RESERVE = 5;
const PAUSE_KEY = "odds:paused";

/** What the sportsbooks think, with their margin taken out. */
export interface MarketPrice {
  /** The point most books are dealing. */
  line: number;
  /** No-vig chance of the over at that point, pushes left out. */
  pOver: number;
  /** How many books priced it. */
  books: number;
  /** A sharp book (Pinnacle, BetOnline) is among them. */
  sharp: boolean;
}

export interface OddsLine {
  line: number;
  /** Who posted it: "Pick 6", or the sportsbook the line came from. */
  book: string;
  /** Sportsbook consensus, when at least one book posted both sides with prices. */
  market?: MarketPrice;
  /** The first line we saw for this prop, when it has moved since. */
  open?: number;
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

/**
 * "Boston Red Sox" is the team ESPN calls "Red Sox"; "Los Angeles Clippers" is "Clippers". Colleges go the other
 * way: ESPN's "Texas" is "Texas Longhorns".
 */
export const sameTeam = (full: string, short: string) => {
  const [f, t] = [normName(full), normName(short)];
  return Boolean(t) && (f === t || f.endsWith(` ${t}`) || f.startsWith(`${t} `));
};

/** The listed event for these teams nearest the given start time. Teams are ESPN short names. */
export function matchEvent<E extends OddsEvent>(events: E[], home: string, away: string, date: string): E | undefined {
  const t = Date.parse(date);
  return events
    .filter((e) => sameTeam(e.home_team, home) && sameTeam(e.away_team, away))
    .sort((x, y) => Math.abs(Date.parse(x.commence_time) - t) - Math.abs(Date.parse(y.commence_time) - t))[0];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

/** American odds → implied probability, margin included. */
export const impliedProb = (american: number) => (american < 0 ? -american / (-american + 100) : 100 / (american + 100));

interface BookQuote {
  book: string;
  point: number;
  over?: number;
  under?: number;
}

/**
 * De-vig each book that priced both sides, then average at the point most books deal (sharp books count
 * double). Undefined when no book posted both prices.
 */
export function marketPrice(quotes: BookQuote[]): MarketPrice | undefined {
  const priced = quotes.filter((q) => !NO_PRICE_BOOKS.has(q.book) && Number.isFinite(q.over) && Number.isFinite(q.under));
  if (!priced.length) return undefined;
  const weight = (q: BookQuote) => (SHARP_BOOKS.has(q.book) ? 2 : 1);
  const byPoint = new Map<number, BookQuote[]>();
  for (const q of priced) byPoint.set(q.point, [...(byPoint.get(q.point) ?? []), q]);
  const [point, at] = [...byPoint.entries()].sort(
    (a, b) => b[1].reduce((s, q) => s + weight(q), 0) - a[1].reduce((s, q) => s + weight(q), 0),
  )[0];
  let w = 0;
  let p = 0;
  for (const q of at) {
    const o = impliedProb(q.over!);
    const u = impliedProb(q.under!);
    p += weight(q) * (o / (o + u));
    w += weight(q);
  }
  return { line: point, pOver: p / w, books: at.length, sharp: at.some((q) => SHARP_BOOKS.has(q.book)) };
}

/** Read the event-odds response into one line per player and stat. */
export function parseEventLines(json: any, sport: Sport): GameLines {
  const byKey = new Map<string, { player: string; stat: StatKey; pick6?: number; books: BookQuote[] }>();
  for (const bm of json?.bookmakers ?? []) {
    const book = String(bm?.key ?? "");
    for (const m of bm?.markets ?? []) {
      const stat = MARKETS[sport][m?.key];
      if (!stat) continue;
      for (const o of m?.outcomes ?? []) {
        const side = String(o?.name).toLowerCase() === "under" ? "under" : "over";
        const player = String(o?.description ?? "").trim();
        const point = Number(o?.point);
        if (!player || !Number.isFinite(point)) continue;
        const key = `${normName(player)}|${stat}`;
        const entry = byKey.get(key) ?? { player, stat, books: [] };
        byKey.set(key, entry);
        // DFS books sometimes send a lone outcome; its point is the line either way.
        if (book === "pick6") {
          entry.pick6 ??= point;
          continue;
        }
        let quote = entry.books.find((b) => b.book === book);
        if (!quote) entry.books.push((quote = { book, point }));
        if (quote.point !== point) continue;
        const price = Number(o?.price);
        if (Number.isFinite(price) && quote[side] === undefined) quote[side] = price;
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
    if (!line) continue;
    const market = marketPrice(e.books);
    if (market) line.market = market;
    (out[normName(e.player)] ??= {})[e.stat] = line;
  }
  return out;
}

/** Remember each prop's first line for a few days and mark the ones that have moved since. */
export function withOpeners(lines: GameLines, openers: Record<string, number>): { lines: GameLines; openers: Record<string, number> } {
  const next = { ...openers };
  for (const [player, stats] of Object.entries(lines)) {
    for (const [stat, l] of Object.entries(stats)) {
      if (!l) continue;
      const key = `${player}|${stat}`;
      next[key] ??= l.line;
      if (next[key] !== l.line) l.open = next[key];
    }
  }
  return { lines, openers: next };
}

/** Can we afford a call costing this many credits right now? */
async function canSpend(cost: number): Promise<boolean> {
  if (await kvGet(PAUSE_KEY).catch(() => null)) return false;
  const left = await kvGet<{ remaining: number }>("odds:remaining").catch(() => null);
  return !left || left.remaining - cost >= CREDIT_RESERVE;
}

/**
 * Lines for one game, found by team names and start time. Empty when the game isn't listed yet.
 * With `spend: false` only cached lines come back, so no credits are used.
 */
export async function fetchGameLines(sport: Sport, home: string, away: string, date: string, opts: { spend?: boolean } = {}): Promise<GameLines> {
  // Once a game starts, Pick 6 has closed it: don't spend credits on it. No markets (UFC), nothing to fetch.
  if (Date.parse(date) < Date.now() || !FETCH_MARKETS[sport].length) return {};
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
  if (opts.spend === false) return {};
  const markets = FETCH_MARKETS[sport];
  if (!(await canSpend(markets.length))) return {};
  const json = await oddsJson(
    `/sports/${key}/events/${event.id}/odds?bookmakers=${BOOKS.join(",")}&markets=${markets.join(",")}&oddsFormat=american`,
    LINES_TTL,
  );
  // Openers outlive the lines cache, so a refetch hours later can show how far the line moved.
  const openKey = `odds:open:${event.id}`;
  const openers = (await kvGet<Record<string, number>>(openKey).catch(() => null)) ?? {};
  const moved = withOpeners(parseEventLines(json, sport), openers);
  const lines = moved.lines;
  await Promise.all([
    kvSet(cacheKey, lines, LINES_TTL).catch(() => {}),
    kvSet(openKey, moved.openers, OPENERS_TTL).catch(() => {}),
  ]);
  return lines;
}

// ---------- Game environment ----------

/** One game's spread and total, the median across books. */
export interface GameOdds {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  total: number;
  /** The home team's spread: negative when the home team is favored. */
  spread: number;
}

/** The slate's spreads and totals, plus the average game total to measure each game against. */
export interface Slate {
  games: GameOdds[];
  avgTotal: number;
}

/** Typical game totals, used when the slate is too small to average (a two-game NBA night says little). */
const TYPICAL_TOTAL: Record<Sport, number> = { NBA: 228, NFL: 44, NHL: 6.1, MLB: 8.6, CFB: 54, CBB: 145, UFC: 2.5 };
const SLATE_MIN_GAMES = 4;
/** Spreads and totals for every game in a sport cost two credits (one per market), so a slate is cached for hours. */
const SLATE_TTL = 6 * 3600;

export function parseSlate(json: any, sport: Sport): Slate {
  const games: GameOdds[] = [];
  for (const ev of Array.isArray(json) ? json : []) {
    const totals: number[] = [];
    const spreads: number[] = [];
    for (const bm of ev?.bookmakers ?? []) {
      for (const m of bm?.markets ?? []) {
        if (m?.key === "totals") {
          const over = (m.outcomes ?? []).find((o: any) => String(o?.name).toLowerCase() === "over");
          if (Number.isFinite(Number(over?.point))) totals.push(Number(over.point));
        }
        if (m?.key === "spreads") {
          const home = (m.outcomes ?? []).find((o: any) => o?.name === ev.home_team);
          if (Number.isFinite(Number(home?.point))) spreads.push(Number(home.point));
        }
      }
    }
    if (!totals.length) continue;
    games.push({
      id: String(ev.id),
      home_team: String(ev.home_team),
      away_team: String(ev.away_team),
      commence_time: String(ev.commence_time),
      total: median(totals),
      spread: spreads.length ? median(spreads) : 0,
    });
  }
  const avgTotal =
    games.length >= SLATE_MIN_GAMES ? games.reduce((s, g) => s + g.total, 0) / games.length : TYPICAL_TOTAL[sport];
  return { games, avgTotal };
}

/** Spreads and totals for a sport's upcoming games. Shared by everyone and cheap, so it isn't a Pro feature. */
export async function fetchSlate(sport: Sport): Promise<Slate | null> {
  // A fight has no spread or game total in the sense the environment model uses.
  if (!oddsEnabled() || sport === "UFC") return null;
  const cacheKey = `odds:slate:${sport}`;
  const cached = await kvGet<Slate>(cacheKey).catch(() => null);
  if (cached) return cached;
  if (!(await canSpend(2))) return null;
  const json = await oddsJson(
    `/sports/${SPORT_KEYS[sport]}/odds?bookmakers=${BOOKS.filter((b) => !NO_PRICE_BOOKS.has(b)).join(",")}&markets=spreads,totals&oddsFormat=american`,
    SLATE_TTL,
  );
  const slate = parseSlate(json, sport);
  await kvSet(cacheKey, slate, SLATE_TTL).catch(() => {});
  return slate;
}

/** One team's side of a game: its implied points and the opponent's, measured against the slate. */
export interface TeamEnv {
  total: number;
  avgTotal: number;
  /** This team's spread: negative when favored. */
  spread: number;
  teamTotal: number;
  oppTotal: number;
}

/** The environment for a team in the game between these ESPN short names, or undefined when the game isn't priced. */
export function teamEnv(slate: Slate | null, home: string, away: string, date: string, isHome: boolean): TeamEnv | undefined {
  const game = slate ? matchEvent(slate.games, home, away, date) : undefined;
  if (!slate || !game) return undefined;
  const spread = isHome ? game.spread : -game.spread;
  // Favored by 6 with a total of 220: 113 to 107.
  const teamTotal = (game.total - spread) / 2;
  return { total: game.total, avgTotal: slate.avgTotal, spread, teamTotal, oppTotal: game.total - teamTotal };
}
