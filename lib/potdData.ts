// Pick of the day (server only): score today's lines once, lock in the best one, and grade past picks.
import { buildBoard } from "./board.ts";
import { loadCalibration } from "./calibrationData.ts";
import { kvGet, kvSet } from "./db.ts";
import { espnDate, fetchTeamPlayers, fetchUpcomingGames, type EspnGame } from "./espn.ts";
import { propContexts } from "./gameContext.ts";
import { gradeLeg } from "./grade.ts";
import { normName } from "./names.ts";
import { fetchGameLines, oddsEnabled, type GameLines } from "./odds.ts";
import { choosePick, potdRecord, type Potd } from "./potd.ts";
import { getProvider, propId } from "./providers.ts";
import { sampleProps } from "./sampleData.ts";
import type { Prop, Sport } from "./types.ts";

const dayKey = (date: string) => `potd:${date}`;
const HISTORY = "potd:history";
/** After a try that found nothing, wait this long before scoring the slate again. */
const RETRY_S = 20 * 60;
const KEEP_S = 400 * 86400;
const SPORTS: Sport[] = ["NBA", "NFL", "NHL", "MLB", "CBB", "CFB"];
/** Enough lines to find a standout without a slow request. */
const MAX_GAMES = 8;
const MAX_PROPS = 80;

/** Today's games that haven't started, earliest first. */
async function todaysGames(date: string, now: number) {
  const lists = await Promise.all(SPORTS.map((s) => fetchUpcomingGames(s).then((gs) => gs.map((g) => ({ sport: s, g })), () => [])));
  return lists
    .flat()
    .filter(({ g }) => g.state === "pre" && Date.parse(g.date) > now + 30 * 60_000 && espnDate(new Date(g.date)) === date)
    .sort((a, b) => a.g.date.localeCompare(b.g.date))
    .slice(0, MAX_GAMES);
}

const teamName = (t: EspnGame["teams"][number]) => t.name || t.abbr;

/** Turn one game's posted lines into props, using the rosters to put each player on a team. */
type Candidate = Prop & { priced: boolean };

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
      out.push({ id: propId(w.name, stat), sport, player: w.name, team: w.team, opponent: w.opp, stat: stat as Prop["stat"], line: l.line, gameTime: g.date, priced: Boolean(l.market) });
    }
  }
  return out;
}

async function score(date: string, now: number): Promise<Potd | null> {
  const provider = getProvider();
  if (provider.name === "sample") return choosePick(await buildBoard(sampleProps(), provider), date, now);
  if (provider.name !== "espn" || !oddsEnabled()) return null;
  const games = await todaysGames(date, now);
  if (!games.length) return null;
  const linesFor = (x: (typeof games)[number], spend: boolean) => {
    const home = x.g.teams.find((t) => t.home) ?? x.g.teams[0];
    const away = x.g.teams.find((t) => !t.home) ?? x.g.teams[1];
    return fetchGameLines(x.sport, teamName(home), teamName(away), x.g.date, { spend }).catch((): GameLines => ({}));
  };
  // Lines people already opened cost nothing. If nobody has yet, buy one game's worth, once a day.
  let lines = await Promise.all(games.map((x) => linesFor(x, false)));
  if (lines.every((l) => !Object.keys(l).length) && !(await kvGet(`potd:spent:${date}`).catch(() => null))) {
    await kvSet(`potd:spent:${date}`, 1, 2 * 86400).catch(() => {});
    lines = [await linesFor(games[0], true), ...lines.slice(1)];
  }
  const props = (await Promise.all(games.map((x, i) => gameProps(x.sport, x.g, lines[i]))))
    .flat()
    // Lines the books priced too come first: the model has a market to check itself against.
    .sort((a, b) => Number(b.priced) - Number(a.priced))
    .slice(0, MAX_PROPS)
    .map(({ priced: _, ...p }): Prop => p);
  if (!props.length) return null;
  const contexts = await propContexts(props, { spend: false }).catch(() => new Map());
  return choosePick(await buildBoard(props, provider, contexts, await loadCalibration()), date, now);
}

const inflight = new Map<string, Promise<Potd | null>>();

/** Today's pick: the saved one, or score the slate now and lock in the best line. */
export async function todaysPick(now = Date.now()): Promise<Potd | null> {
  const date = espnDate(new Date(now));
  const saved = await kvGet<Potd>(dayKey(date)).catch(() => null);
  if (saved) return saved;
  if (getProvider().name !== "sample" && (await kvGet(`potd:try:${date}`).catch(() => null))) return null;
  if (!inflight.has(date)) {
    const run = async () => {
      await kvSet(`potd:try:${date}`, 1, RETRY_S).catch(() => {});
      const pick = await score(date, now);
      if (pick && getProvider().name !== "sample") {
        await kvSet(dayKey(date), pick, KEEP_S);
        const history = (await kvGet<Potd[]>(HISTORY).catch(() => null)) ?? [];
        await kvSet(HISTORY, [pick, ...history.filter((p) => p.date !== date)].slice(0, 365), KEEP_S);
      }
      return pick;
    };
    inflight.set(date, run().catch(() => null).finally(() => inflight.delete(date)));
  }
  return inflight.get(date)!;
}

/** Grade past picks whose games are over, and return the history (newest first). */
export async function potdHistory(now = Date.now()): Promise<Potd[]> {
  const history = (await kvGet<Potd[]>(HISTORY).catch(() => null)) ?? [];
  const due = history.filter((p) => !p.result && now > Date.parse(p.gameTime) + 3 * 3600_000);
  if (!due.length) return history;
  const results = await Promise.all(due.map((p) => gradeLeg({ ...p, savedAt: p.gameTime }).catch(() => null)));
  let changed = false;
  const next = history.map((p) => {
    const i = due.indexOf(p);
    if (i < 0 || !results[i]) return p;
    changed = true;
    return { ...p, result: results[i]! };
  });
  if (changed) {
    await kvSet(HISTORY, next, KEEP_S).catch(() => {});
    await Promise.all(next.filter((p) => p.result && due.some((d) => d.date === p.date)).map((p) => kvSet(dayKey(p.date), p, KEEP_S).catch(() => {})));
  }
  return next;
}

export async function potdSummary(now = Date.now()) {
  const [pick, history] = await Promise.all([todaysPick(now), potdHistory(now)]);
  const today = pick ? (history.find((p) => p.date === pick.date) ?? pick) : null;
  return { pick: today, record: potdRecord(history), recent: history.filter((p) => p.result).slice(0, 10) };
}
