// Today's slate, scored (server only): the lines posted for today's games that haven't started, run through the
// model once and shared by the pick of the day, the Daily Lock menu, soft-line and injury ripple scans.
// Only lines someone already opened are used (they cost nothing); if nobody has, one game's worth is bought a day.
import { buildBoard } from "./board.ts";
import { loadCalibration } from "./calibrationData.ts";
import { kvGet, kvSet } from "./db.ts";
import { espnDate, fetchTeamPlayers, fetchUpcomingGames, type EspnGame } from "./espn.ts";
import { propContexts } from "./gameContext.ts";
import { normName } from "./names.ts";
import { fetchGameLines, oddsEnabled, type GameLines } from "./odds.ts";
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
}

const SPORTS: Sport[] = ["NBA", "NFL", "NHL", "MLB", "CBB", "CFB"];
/** Enough lines to find standouts without a slow request. */
const MAX_GAMES = 8;
const MAX_PROPS = 80;
/** Lines move slowly; rescoring this often is plenty. */
const FRESH_S = 30 * 60;

/** Today's games that haven't started, earliest first. */
async function todaysGames(date: string, now: number) {
  const lists = await Promise.all(SPORTS.map((s) => fetchUpcomingGames(s).then((gs) => gs.map((g) => ({ sport: s, g })), () => [])));
  return lists
    .flat()
    .filter(({ g }) => g.state === "pre" && Date.parse(g.date) > now + 10 * 60_000 && espnDate(new Date(g.date)) === date)
    .sort((a, b) => a.g.date.localeCompare(b.g.date))
    .slice(0, MAX_GAMES);
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

async function score(date: string, now: number): Promise<SlateRow[]> {
  const provider = getProvider();
  if (provider.name === "sample") {
    // The demo slate's dates are fixed; treat it as tonight's.
    const tonight = new Date(now + 6 * 3600_000).toISOString();
    const rows = await buildBoard(sampleProps().map((p) => ({ ...p, gameTime: tonight })), provider);
    return rows.map((r) => ({ ...r, pick6: true, book: sampleBook(r) }));
  }
  if (provider.name !== "espn" || !oddsEnabled()) return [];
  const games = await todaysGames(date, now);
  if (!games.length) return [];
  const linesFor = (x: (typeof games)[number], spend: boolean) => {
    const home = x.g.teams.find((t) => t.home) ?? x.g.teams[0];
    const away = x.g.teams.find((t) => !t.home) ?? x.g.teams[1];
    return fetchGameLines(x.sport, teamName(home), teamName(away), x.g.date, { spend }).catch((): GameLines => ({}));
  };
  let lines = await Promise.all(games.map((x) => linesFor(x, false)));
  if (lines.every((l) => !Object.keys(l).length) && !(await kvGet(`potd:spent:${date}`).catch(() => null))) {
    await kvSet(`potd:spent:${date}`, 1, 2 * 86400).catch(() => {});
    lines = [await linesFor(games[0], true), ...lines.slice(1)];
  }
  const candidates = (await Promise.all(games.map((x, i) => gameProps(x.sport, x.g, lines[i]))))
    .flat()
    // Lines the books priced too come first: the model has a market to check itself against.
    .sort((a, b) => Number(b.priced) - Number(a.priced))
    .slice(0, MAX_PROPS);
  if (!candidates.length) return [];
  const meta = new Map(candidates.map((c) => [c.id, c]));
  const props = candidates.map(({ priced: _, pick6: __, open: ___, book: ____, ...p }): Prop => p);
  const contexts = await propContexts(props, { spend: false }).catch(() => new Map());
  const rows = await buildBoard(props, provider, contexts, await loadCalibration());
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
