// Today's slate, scored (server only): the lines posted for today's games that haven't started, run through the
// model once and shared by the pick of the day, the Daily Lock menu, soft-line and injury ripple scans.
// Only lines someone already opened are used (they cost nothing); if nobody has, one game's worth is bought a day.
import { buildBoard } from "./board.ts";
import { loadCalibration } from "./calibrationData.ts";
import { kvGet, kvSet } from "./db.ts";
import { espnDate, fetchTeamPlayers, fetchUpcomingGames, type EspnGame } from "./espn.ts";
import { propContexts } from "./gameContext.ts";
import { normName } from "./names.ts";
import { FREE_MARKETS, fetchGameLines, oddsEnabled, oddsPlan, type GameLines } from "./odds.ts";
import { getProvider, propId } from "./providers.ts";
import { toAmerican, type PropBook } from "./books.ts";
import { sampleProps } from "./sampleData.ts";
import { logSoft } from "./softLog.ts";
import type { Prop, PropWithProjection, Sport } from "./types.ts";

/** One scored line, with where it came from. */
export type SlateRow = PropWithProjection & {
  /** The line is Pick 6's own (not a sportsbook's stand-in). */
  pick6: boolean;
  /** The first line we saw, when it has moved since. */
  open?: number;
  /** The sportsbooks' line and best prices, for betting the prop straight (lib/books.ts). */
  book?: PropBook;
};

export interface Slate {
  date: string;
  at: string;
  rows: SlateRow[];
  /** What the last scan found at each step, so an empty slip can be explained. */
  report?: ScanReport;
}

export interface ScanReport {
  games: number;
  /** Games inside the free plan's fetch window. */
  inWindow: number;
  gamesWithLines: number;
  lines: number;
  pick6Lines: number;
  rows: number;
  /** Why the scan stopped early, when it did. */
  stopped?: string;
  error?: string;
}

export const SPORTS: Sport[] = ["NBA", "NFL", "NHL", "MLB", "CBB", "CFB"];
/** Enough lines to find standouts without a slow request. */
const MAX_GAMES = 8;
const MAX_PROPS = 80;
/** Lines move slowly; rescoring this often is plenty. */
const FRESH_S = 30 * 60;

/** Today's games that haven't started, earliest first. */
async function todaysGames(date: string, now: number, sports = SPORTS, max = MAX_GAMES) {
  const lists = await Promise.all(sports.map((s) => fetchUpcomingGames(s).then((gs) => gs.map((g) => ({ sport: s, g })), () => [])));
  return lists
    .flat()
    .filter(({ g }) => g.state === "pre" && Date.parse(g.date) > now + 10 * 60_000 && espnDate(new Date(g.date)) === date)
    .sort((a, b) => a.g.date.localeCompare(b.g.date))
    .slice(0, max);
}

const teamName = (t: EspnGame["teams"][number]) => t.name || t.abbr;

type Candidate = Prop & { priced: boolean; pick6: boolean; open?: number; book?: PropBook };

/** Turn one game's posted lines into props, using the rosters to put each player on a team. */
async function gameProps(sport: Sport, g: EspnGame, lines: GameLines): Promise<Candidate[]> {
  const [a, b] = g.teams;
  if (!a || !b) return [];
  const rosters = await Promise.all(g.teams.map((t) => (t.id ? fetchTeamPlayers(sport, t.id).catch(() => []) : [])));
  const who = new Map<string, { name: string; team: string; opp: string }>();
  rosters.forEach((players, i) => {
    const team = g.teams[i].abbr;
    const opp = g.teams[1 - i].abbr;
    for (const p of players) who.set(normName(p.name), { name: p.name, team, opp });
  });
  const out: Candidate[] = [];
  for (const [player, stats] of Object.entries(lines)) {
    const w = who.get(player);
    if (!w) continue;
    for (const [stat, l] of Object.entries(stats)) {
      if (!l) continue;
      out.push({
        id: propId(w.name, stat),
        sport,
        player: w.name,
        team: w.team,
        opponent: w.opp,
        stat: stat as Prop["stat"],
        line: l.line,
        gameTime: g.date,
        priced: Boolean(l.market),
        pick6: l.book === "Pick 6",
        open: l.open,
        book: l.market && l.best ? { line: l.market.line, ...l.best } : undefined,
      });
    }
  }
  return out;
}

/** How one scan reads the board: which sports, how many games and lines, and whether it may spend credits on lines. */
interface ScanOpts {
  sports: Sport[];
  maxGames: number;
  maxProps: number;
  /** Fetch every game's lines (credits), rather than only the ones already cached. */
  spend: boolean;
  markets?: string[];
  /** Only spend on games starting within this long (Pick 6 posts lines on game day). */
  spendWithinMs?: number;
  /** Seconds before a fetch without Pick 6's lines is tried again. */
  linesRetry?: number;
  linesTtl?: number;
}
const ALL: ScanOpts = { sports: SPORTS, maxGames: MAX_GAMES, maxProps: MAX_PROPS, spend: false };

async function score(date: string, now: number, opts: ScanOpts = ALL, report?: ScanReport): Promise<SlateRow[]> {
  const provider = getProvider();
  if (provider.name === "sample") {
    // The demo slate's dates are fixed; treat it as tonight's.
    const tonight = new Date(now + 6 * 3600_000).toISOString();
    const rows = await buildBoard(sampleProps().filter((p) => opts.sports.includes(p.sport)).map((p) => ({ ...p, gameTime: tonight })), provider);
    return rows.map((r) => ({ ...r, pick6: true, book: sampleBook(r) }));
  }
  if (provider.name !== "espn" || !oddsEnabled()) {
    if (report) report.stopped = provider.name !== "espn" ? `data source is ${provider.name}` : "no Odds API key";
    return [];
  }
  const games = await todaysGames(date, now, opts.sports, opts.maxGames);
  if (report) report.games = games.length;
  if (!games.length) {
    if (report) report.stopped = "no games left today";
    return [];
  }
  const linesFor = (x: (typeof games)[number], spend: boolean) => {
    const home = x.g.teams.find((t) => t.home) ?? x.g.teams[0];
    const away = x.g.teams.find((t) => !t.home) ?? x.g.teams[1];
    return fetchGameLines(x.sport, teamName(home), teamName(away), x.g.date, { spend, markets: opts.markets, ttl: opts.linesTtl, retry: opts.linesRetry }).catch((): GameLines => ({}));
  };
  const soon = (x: (typeof games)[number]) => !opts.spendWithinMs || Date.parse(x.g.date) - now <= opts.spendWithinMs;
  let lines = await Promise.all(games.map((x) => linesFor(x, opts.spend && soon(x))));
  if (report) {
    report.inWindow = games.filter(soon).length;
    report.gamesWithLines = lines.filter((l) => Object.keys(l).length).length;
    const all = lines.flatMap((l) => Object.values(l).flatMap((stats) => Object.values(stats)));
    report.lines = all.length;
    report.pick6Lines = all.filter((l) => l?.book === "Pick 6").length;
  }
  // On the free plan only the auto slips spend credits.
  if (!opts.spend && oddsPlan() === "paid" && lines.every((l) => !Object.keys(l).length) && !(await kvGet(`potd:spent:${date}`).catch(() => null))) {
    await kvSet(`potd:spent:${date}`, 1, 2 * 86400).catch(() => {});
    lines = [await linesFor(games[0], true), ...lines.slice(1)];
  }
  const candidates = (await Promise.all(games.map((x, i) => gameProps(x.sport, x.g, lines[i]))))
    .flat()
    // Lines the books priced too come first: the model has a market to check itself against.
    .sort((a, b) => Number(b.priced) - Number(a.priced))
    .slice(0, opts.maxProps);
  if (!candidates.length) {
    if (report) report.stopped = report.gamesWithLines ? "lines found but no players matched the rosters" : report.inWindow ? "no lines came back for games in the window" : "no games within 4 hours yet";
    return [];
  }
  const meta = new Map(candidates.map((c) => [c.id, c]));
  const props = candidates.map(({ priced: _, pick6: __, open: ___, book: ____, ...p }): Prop => p);
  const contexts = await propContexts(props, { spend: false }).catch(() => new Map());
  const rows = await buildBoard(props, provider, contexts, await loadCalibration());
  if (report) report.rows = rows.length;
  return rows.map((r) => ({ ...r, pick6: meta.get(r.id)?.pick6 ?? false, open: meta.get(r.id)?.open, book: meta.get(r.id)?.book }));
}

/** Demo prices for the sample slate: the books lean halfway to the model, with a normal margin and a little spread between books. */
function sampleBook(r: PropWithProjection): PropBook {
  const lean = 0.5 + (r.projection.pOver - 0.5) * 0.5;
  const wobble = ((r.player.length * 7 + r.line * 10) % 9) / 100 - 0.03;
  return {
    line: r.line,
    over: { book: "FanDuel", price: toAmerican(Math.min(0.9, lean + 0.022 - wobble)) },
    under: { book: "DraftKings", price: toAmerican(Math.min(0.9, 1 - lean + 0.022 + wobble)) },
  };
}

const inflight = new Map<string, Promise<Slate>>();

/** Today's scored slate: the saved one if it's fresh, otherwise score it now (shared between callers). */
export async function todaysSlate(now = Date.now()): Promise<Slate> {
  const date = espnDate(new Date(now));
  const key = `slate:${date}`;
  const saved = await kvGet<Slate>(key).catch(() => null);
  if (saved && now - Date.parse(saved.at) < FRESH_S * 1000) return saved;
  if (!inflight.has(date)) {
    const run = async (): Promise<Slate> => {
      const rows = await score(date, now).catch(() => [] as SlateRow[]);
      // Keep the last good scan if this one came up empty (lines briefly missing, a failed fetch).
      const slate = { date, at: new Date(now).toISOString(), rows: rows.length || !saved ? rows : saved.rows };
      if (getProvider().name !== "sample") {
        await kvSet(key, slate, 2 * 86400).catch(() => {});
        // Every soft line we flag goes on the record, so the track record grows with no extra lookups.
        if (rows.length) await logSoft(rows, now).catch(() => {});
      }
      return slate;
    };
    inflight.set(date, run().finally(() => inflight.delete(date)));
  }
  return inflight.get(date)!;
}

/** Games per sport the auto slip scans: enough to find the best lines, few enough to keep the Odds API bill sane. */
const SPORT_GAMES = 12;
const SPORT_PROPS = 160;
const sportInflight = new Map<string, Promise<Slate>>();

/**
 * One sport's slate for its auto slip: every game today (up to 12), with lines fetched for each (this spends Odds
 * API credits; each game's lines are then cached for six hours), scored like the main slate.
 */
export async function sportSlate(sport: Sport, now = Date.now()): Promise<Slate> {
  const date = espnDate(new Date(now));
  const key = `slate:${sport}:${date}`;
  const saved = await kvGet<Slate>(key).catch(() => null);
  if (saved && now - Date.parse(saved.at) < FRESH_S * 1000) return saved;
  const id = `${sport}:${date}`;
  if (!sportInflight.has(id)) {
    const run = async (): Promise<Slate> => {
      // Free plan: one stat, fetched once per game within six hours of the start and kept all day (~350 credits a month).
      const free = oddsPlan() === "free";
      const opts: ScanOpts = free
        ? { sports: [sport], maxGames: SPORT_GAMES, maxProps: SPORT_PROPS, spend: true, markets: FREE_MARKETS[sport], spendWithinMs: 4 * 3600_000, linesTtl: 20 * 3600, linesRetry: 2 * 3600 }
        : { sports: [sport], maxGames: SPORT_GAMES, maxProps: SPORT_PROPS, spend: true };
      const report: ScanReport = { games: 0, inWindow: 0, gamesWithLines: 0, lines: 0, pick6Lines: 0, rows: 0 };
      const rows = await score(date, now, opts, report).catch((e: unknown) => {
        report.error = String((e as Error)?.message ?? e).slice(0, 300);
        return [] as SlateRow[];
      });
      const slate = { date, at: new Date(now).toISOString(), rows: rows.length || !saved ? rows : saved.rows, report };
      if (getProvider().name !== "sample") await kvSet(key, slate, 2 * 86400).catch(() => {});
      return slate;
    };
    sportInflight.set(id, run().finally(() => sportInflight.delete(id)));
  }
  return sportInflight.get(id)!;
}
