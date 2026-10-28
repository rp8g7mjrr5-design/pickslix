// ESPN's public JSON feeds (no key). These are undocumented, so every parser here is defensive:
// a missing field turns into 0 or gets skipped instead of throwing.
import { canonTeam, normName } from "./names.ts";
import { STATS, type DefenseFactors, type GameLog, type NewsItem, type Sport, type StatKey } from "./types.ts";

export type EspnSport = Sport;

const PATHS: Record<EspnSport, string> = {
  NBA: "basketball/nba",
  NFL: "football/nfl",
  NHL: "hockey/nhl",
  MLB: "baseball/mlb",
};
const SITE = "https://site.api.espn.com/apis/site/v2/sports";
const WEB = "https://site.web.api.espn.com/apis/common/v3";

/** Seconds to cache each kind of response in Next's data cache. */
export const TTL = { search: 7 * 86400, gamelog: 3600, injuries: 900, scoreboard: 600, finished: 7 * 86400, players: 6 * 3600 };

export async function espnJson(url: string, revalidate: number): Promise<any> {
  const res = await fetch(url, { headers: { accept: "application/json" }, next: { revalidate } } as RequestInit);
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
}

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** YYYYMMDD in US Eastern time, which is how ESPN buckets game days. */
export function espnDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts.replace(/-/g, "");
}

// ---------- Players ----------

export interface EspnAthlete {
  id: string;
  name: string;
  team: string;
}

export function parseSearch(json: any, sport: EspnSport): EspnAthlete[] {
  const league = sport.toLowerCase();
  return (json?.items ?? [])
    .filter((i: any) => i?.type === "player" && i?.league === league)
    .map((i: any) => ({
      id: String(i.id),
      name: String(i.displayName ?? ""),
      team: canonTeam(i.teamRelationships?.[0]?.core?.abbreviation ?? "", sport),
    }));
}

/** "N. Jokic" / "N Jokic": Pick 6 shortens first names to an initial. */
function shortName(name: string): { initial: string; last: string } | null {
  const t = normName(name).split(" ");
  return t.length >= 2 && t[0].length === 1 ? { initial: t[0], last: t.slice(1).join(" ") } : null;
}

/** Best match for a name: exact (normalized) name first, then initial + last name, then the hinted team. */
export function pickAthlete(found: EspnAthlete[], player: string, teamHints: string[] = []): EspnAthlete | undefined {
  const target = normName(player);
  let pool = found.filter((a) => normName(a.name) === target);
  const short = shortName(player);
  if (!pool.length && short) {
    pool = found.filter((a) => {
      const t = normName(a.name).split(" ");
      return t[0]?.[0] === short.initial && t.slice(1).join(" ") === short.last;
    });
    // "A. Bailey" fits more than one player; without a team to go on, ESPN's ranking decides.
    return pool.find((a) => teamHints.includes(a.team)) ?? pool[0];
  }
  return (pool.length ? pool : found).find((a) => teamHints.includes(a.team)) ?? pool[0];
}

export async function findAthlete(player: string, sport: EspnSport, teamHints: string[] = []) {
  const [sportPath, league] = PATHS[sport].split("/");
  // ESPN's search doesn't match initials, so look short names up by last name.
  const q = encodeURIComponent(shortName(player)?.last ?? player.replace(/\./g, "").trim());
  const json = await espnJson(`${WEB}/search?query=${q}&type=player&sport=${sportPath}&league=${league}&limit=10`, TTL.search);
  return pickAthlete(parseSearch(json, sport), player, teamHints);
}

// ---------- Game logs ----------

/** Maps our GameLog stat fields to the column names ESPN uses in a gamelog. */
const COLUMNS: Record<EspnSport, Record<string, string>> = {
  NBA: {
    pts: "points",
    reb: "totalRebounds",
    ast: "assists",
    fg3m: "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
    stl: "steals",
    blk: "blocks",
    tov: "turnovers",
  },
  NFL: {
    passYds: "passingYards",
    passTd: "passingTouchdowns",
    passAtt: "passingAttempts",
    rushYds: "rushingYards",
    rushAtt: "rushingAttempts",
    rec: "receptions",
    recYds: "receivingYards",
  },
  NHL: {
    goals: "goals",
    assists: "assists",
    shots: "shotsTotal",
    saves: "saves",
  },
  MLB: {
    hits: "hits",
    runs: "runs",
    rbi: "RBIs",
    hr: "homeRuns",
    doubles: "doubles",
    triples: "triples",
  },
};

/** A pitcher's log reuses "hits" and "strikeouts" for what he allowed and threw. */
const MLB_PITCHING: Record<string, string> = { k: "strikeouts", hitsAllowed: "hits", outs: "innings" };

/** "22:27" → 22.45 minutes */
const clock = (v: unknown) => {
  const [m, s] = String(v ?? "").split(":");
  return num(m) + num(s) / 60;
};

/** Innings as ESPN writes them ("5.2" is five and two-thirds) → outs. */
export const inningsToOuts = (v: unknown) => {
  const [whole, part] = String(v ?? "0").split(".");
  return num(whole) * 3 + Math.min(2, num(part));
};

export function parseGameLog(json: any, sport: EspnSport): GameLog[] {
  const names: string[] = json?.names ?? [];
  const col = (n: string) => names.indexOf(n);
  const minutes = col(sport === "NHL" ? "timeOnIcePerGame" : "minutes");
  const pitcher = sport === "MLB" && names.includes("innings");
  const fields = Object.entries(pitcher ? MLB_PITCHING : COLUMNS[sport]).map(([field, name]) => [field, col(name)] as const);
  const seen = new Set<string>();
  const logs: GameLog[] = [];
  for (const st of json?.seasonTypes ?? []) {
    if (/preseason/i.test(st?.displayName ?? "")) continue;
    for (const cat of st?.categories ?? []) {
      for (const ev of cat?.events ?? []) {
        const id = String(ev?.eventId ?? "");
        const meta = json?.events?.[id];
        if (!id || !meta || seen.has(id)) continue;
        seen.add(id);
        const row: string[] = ev.stats ?? [];
        const stats: Record<string, number> = {};
        // "made-attempted" columns keep the made half.
        for (const [field, i] of fields) if (i >= 0) stats[field] = num(String(row[i] ?? "").split("-")[0]);
        if (pitcher) stats.outs = inningsToOuts(row[col("innings")]);
        if (sport === "MLB" && !pitcher) {
          stats.tb = (stats.hits ?? 0) + (stats.doubles ?? 0) + 2 * (stats.triples ?? 0) + 3 * (stats.hr ?? 0);
        }
        logs.push({
          date: String(meta.gameDate ?? "").slice(0, 10),
          opponent: canonTeam(meta.opponent?.abbreviation ?? "", sport),
          // ESPN only lists games the player appeared in. NFL and MLB logs have no playing time, so 100 stands for "played".
          playing: minutes < 0 ? 100 : sport === "NHL" ? clock(row[minutes]) : num(row[minutes]),
          stats,
          // "vs" at home, "@" away.
          ...(meta.atVs === "vs" ? { home: true } : meta.atVs === "@" ? { home: false } : {}),
        });
      }
    }
  }
  return logs.sort((a, b) => b.date.localeCompare(a.date));
}

/** A game this long ago is from before the offseason (or a long injury), whatever ESPN's season filter says. */
const STALE_DAYS = 100;

/** Mark games from an earlier season, so the model can count them for less. */
export function markPrior(logs: GameLog[], now = Date.now()): GameLog[] {
  return logs.map((g) => (g.prior || now - Date.parse(g.date) > STALE_DAYS * 86400_000 ? { ...g, prior: true } : g));
}

/**
 * Current season's games. Early in the year, last season's games fill in up to `minGames`, marked as prior
 * so they count for less and never crowd out this season's.
 */
export async function fetchGameLogs(athleteId: string, sport: EspnSport, minGames = 15): Promise<GameLog[]> {
  const base = `${WEB}/sports/${PATHS[sport]}/athletes/${athleteId}/gamelog`;
  const current = await espnJson(base, TTL.gamelog);
  const logs = markPrior(parseGameLog(current, sport));
  const season = Number(current?.filters?.find((f: any) => f?.name === "season")?.value);
  if (logs.length >= minGames || !season) return logs;
  const prev = await espnJson(`${base}?season=${season - 1}`, TTL.finished).catch(() => null);
  if (!prev) return logs;
  const older = parseGameLog(prev, sport).slice(0, minGames - logs.length).map((g) => ({ ...g, prior: true }));
  return [...logs, ...older];
}

// ---------- Injuries ----------

export function parseInjuries(json: any, sport: EspnSport): NewsItem[] {
  const items: NewsItem[] = [];
  for (const team of json?.injuries ?? []) {
    for (const inj of team?.injuries ?? []) {
      const status = String(inj?.status ?? "");
      const kind = /^(out|injured reserve|suspension)/i.test(status)
        ? "player_out"
        : /questionable|doubtful|day-to-day/i.test(status)
          ? "player_questionable"
          : null;
      const player = inj?.athlete?.displayName;
      if (!kind || !player) continue;
      const body = inj.details?.type ? ` (${inj.details.type})` : "";
      items.push({
        id: `espn-${sport}-${inj.id ?? player}`,
        date: String(inj.date ?? "").slice(0, 10),
        player,
        team: canonTeam(inj.athlete?.team?.abbreviation ?? "", sport),
        kind,
        headline: `${player}${body} ${status.toLowerCase()}${inj.shortComment ? `: ${inj.shortComment}` : ""}`,
      });
    }
  }
  return items;
}

export async function fetchInjuries(sport: EspnSport): Promise<NewsItem[]> {
  return parseInjuries(await espnJson(`${SITE}/${PATHS[sport]}/injuries`, TTL.injuries), sport);
}

// ---------- Schedule ----------

export interface EspnGame {
  id: string;
  date: string;
  state: "pre" | "in" | "post";
  seasonType: number;
  teams: EspnTeam[];
}

export interface EspnTeam {
  abbr: string;
  stats: Record<string, number>;
  id?: string;
  name?: string;
  logo?: string;
  color?: string;
  record?: string;
  home?: boolean;
}

export function parseScoreboard(json: any, sport: EspnSport): EspnGame[] {
  return (json?.events ?? []).map((e: any) => {
    const comp = e?.competitions?.[0] ?? {};
    return {
      id: String(e?.id ?? ""),
      date: String(e?.date ?? ""),
      state: comp?.status?.type?.state ?? "pre",
      seasonType: Number(e?.season?.type ?? 2),
      teams: (comp?.competitors ?? []).map((c: any) => ({
        abbr: canonTeam(c?.team?.abbreviation ?? "", sport),
        stats: Object.fromEntries((c?.statistics ?? []).map((s: any) => [s?.name, num(s?.displayValue)])),
        id: String(c?.team?.id ?? ""),
        name: String(c?.team?.shortDisplayName ?? c?.team?.displayName ?? ""),
        logo: c?.team?.logo || undefined,
        color: c?.team?.color ? `#${c.team.color}` : undefined,
        record: c?.records?.find((r: any) => r?.type === "total")?.summary,
        home: c?.homeAway === "home",
      })),
    };
  });
}

export async function fetchScoreboard(sport: EspnSport, query = "", revalidate = TTL.scoreboard) {
  const json = await espnJson(`${SITE}/${PATHS[sport]}/scoreboard${query ? `?${query}` : ""}`, revalidate);
  return { games: parseScoreboard(json, sport), week: Number(json?.week?.number) || 0 };
}

/** The team's next (or in-progress) game in the coming few days. */
export async function findNextGame(sport: EspnSport, team: string): Promise<{ opponent: string; gameTime: string } | null> {
  // NFL: this week's slate, then next week's (by Tuesday the current week is usually all final).
  const queries =
    sport === "NFL" ? ["", "next"] : [0, 1, 2].map((d) => `dates=${espnDate(new Date(Date.now() + d * 86400_000))}`);
  let week = 0;
  for (const q of queries) {
    const query = q === "next" ? (week ? `seasontype=2&week=${week + 1}` : null) : q;
    if (query === null) continue;
    const { games, week: w } = await fetchScoreboard(sport, query).catch(() => ({ games: [] as EspnGame[], week: 0 }));
    week ||= w;
    const g = games.find((g) => g.state !== "post" && g.teams.some((t) => t.abbr === team));
    const opp = g?.teams.find((t) => t.abbr !== team);
    if (g && opp) return { opponent: opp.abbr, gameTime: g.date };
  }
  return null;
}

/** Games that haven't finished yet: the next three days for NBA; what's left of this week plus next week for NFL. */
export async function fetchUpcomingGames(sport: EspnSport): Promise<EspnGame[]> {
  // Games not yet started come first; ones already under way go to the end.
  const live = (gs: EspnGame[]) =>
    gs
      .filter((g) => g.state !== "post" && g.teams.length === 2)
      .sort((a, b) => Number(a.state === "in") - Number(b.state === "in") || a.date.localeCompare(b.date));
  if (sport === "NFL") {
    const now = await fetchScoreboard(sport);
    if (!now.week) return live(now.games);
    const next = await fetchScoreboard(sport, `seasontype=2&week=${now.week + 1}`).catch(() => ({ games: [] as EspnGame[] }));
    return live([...now.games, ...next.games]);
  }
  const days = await Promise.all(
    [0, 1, 2].map((d) =>
      fetchScoreboard(sport, `dates=${espnDate(new Date(Date.now() + d * 86400_000))}`).catch(() => ({ games: [] as EspnGame[] })),
    ),
  );
  return live(days.flatMap((d) => d.games));
}

// ---------- Team players ----------

export interface TeamPlayer {
  id: string;
  name: string;
  pos: string;
  headshot?: string;
  games: number;
  /** Season per-game averages for the stats this player gets lines on. */
  avg: Partial<Record<StatKey, number>>;
}

const NFL_POS = ["QB", "RB", "WR", "TE"];

const flatStats = (leader: any): Record<string, number> =>
  Object.fromEntries((leader?.statistics ?? []).flatMap((g: any) => (g?.stats ?? []).map((x: any) => [x?.name, num(x?.value)])));

const athleteOf = (a: any, pos: string): Omit<TeamPlayer, "games" | "avg"> => ({
  id: String(a?.id ?? ""),
  name: String(a?.displayName ?? a?.fullName ?? ""),
  pos,
  headshot: typeof a?.headshot === "string" ? a.headshot : a?.headshot?.href,
});

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Players with stats this season, from ESPN's team athlete statistics, most-used first. */
export function parseTeamPlayers(json: any, sport: EspnSport): TeamPlayer[] {
  const results: any[] = json?.results ?? [];
  if (sport === "NBA") {
    const leaders = results.find((r) => r?.name === "game")?.leaders ?? results[0]?.leaders ?? [];
    return leaders
      .map((l: any) => {
        const st = flatStats(l);
        const [pts, reb, ast] = [st.avgPoints ?? 0, st.avgRebounds ?? 0, st.avgAssists ?? 0];
        return {
          ...athleteOf(l?.athlete, l?.athlete?.position?.abbreviation ?? ""),
          games: st.gamesPlayed ?? 0,
          minutes: st.avgMinutes ?? 0,
          avg: {
            PTS: r1(pts), REB: r1(reb), AST: r1(ast), "3PM": r1(st.avgThreePointFieldGoalsMade ?? 0),
            PRA: r1(pts + reb + ast), PR: r1(pts + reb), PA: r1(pts + ast), RA: r1(reb + ast),
          },
        };
      })
      .filter((p: any) => p.id && p.games > 0)
      .sort((a: any, b: any) => b.minutes - a.minutes)
      .map(({ minutes, ...p }: any) => p as TeamPlayer);
  }
  if (sport === "NHL") return nhlPlayers(results);
  if (sport === "MLB") return mlbPlayers(results);
  const byId = new Map<string, TeamPlayer & { yards: number }>();
  for (const cat of results) {
    if (!["passing", "rushing", "receiving"].includes(cat?.name)) continue;
    for (const l of cat?.leaders ?? []) {
      const pos = l?.athlete?.position?.abbreviation ?? "";
      if (!NFL_POS.includes(pos)) continue;
      const base = athleteOf(l?.athlete, pos);
      const st = flatStats(l);
      const p = byId.get(base.id) ?? { ...base, games: 0, avg: {}, yards: 0 };
      p.games = Math.max(p.games, st.gamesPlayed ?? 0);
      const per = (v = 0) => r1(v / Math.max(1, st.gamesPlayed ?? 1));
      if (cat.name === "passing") {
        Object.assign(p.avg, { PASS_YDS: per(st.passingYards), PASS_TD: per(st.passingTouchdowns), PASS_ATT: per(st.passingAttempts) });
        p.yards += per(st.passingYards);
      } else if (cat.name === "rushing") {
        p.avg.RUSH_YDS = per(st.rushingYards);
        p.yards += per(st.rushingYards);
      } else {
        Object.assign(p.avg, { REC: per(st.receptions), REC_YDS: per(st.receivingYards) });
        p.yards += per(st.receivingYards);
      }
      if (p.avg.RUSH_YDS !== undefined || p.avg.REC_YDS !== undefined) {
        p.avg.RUSH_REC_YDS = r1((p.avg.RUSH_YDS ?? 0) + (p.avg.REC_YDS ?? 0));
      }
      byId.set(base.id, p);
    }
  }
  return [...byId.values()]
    .filter((p) => p.id && p.games > 0)
    .sort((a, b) => NFL_POS.indexOf(a.pos) - NFL_POS.indexOf(b.pos) || b.yards - a.yards)
    .map(({ yards, ...p }) => p);
}

/** Skaters by ice time, then goalies. */
function nhlPlayers(results: any[]): TeamPlayer[] {
  const rows: (TeamPlayer & { rank: number })[] = [];
  for (const cat of results) {
    for (const l of cat?.leaders ?? []) {
      const st = flatStats(l);
      const games = st.games ?? st.gamesPlayed ?? 0;
      if (!games) continue;
      const per = (v = 0) => r1(v / games);
      const pos = l?.athlete?.position?.abbreviation ?? "";
      const goalie = cat?.name === "goalkeeping" || pos === "G";
      if (rows.some((r) => r.id === String(l?.athlete?.id))) continue;
      rows.push({
        ...athleteOf(l?.athlete, pos),
        games,
        avg: goalie
          ? { SAVES: per(st.saves) }
          : { SOG: per(st.shotsTotal), NHL_PTS: per(st.points), GOALS: per(st.goals), NHL_AST: per(st.assists) },
        rank: goalie ? -1 : st.timeOnIce ?? st.points ?? 0,
      });
    }
  }
  return rows.sort((a, b) => b.rank - a.rank).map(({ rank, ...p }) => p);
}

/** Hitters by plate appearances, then pitchers by innings. */
function mlbPlayers(results: any[]): TeamPlayer[] {
  const rows: (TeamPlayer & { rank: number })[] = [];
  for (const cat of results) {
    const pitching = cat?.name === "pitching";
    if (!pitching && cat?.name !== "batting") continue;
    for (const l of cat?.leaders ?? []) {
      const st = flatStats(l);
      const games = st.gamesPlayed ?? 0;
      if (!games) continue;
      const per = (v = 0) => r1(v / games);
      if (pitching) {
        const outs = inningsToOuts(st.innings ?? 0);
        rows.push({
          ...athleteOf(l?.athlete, l?.athlete?.position?.abbreviation ?? "P"),
          games,
          avg: { K: per(st.strikeouts), OUTS: per(outs), HITS_ALLOWED: per(st.hits) },
          rank: outs / 1000,
        });
      } else {
        rows.push({
          ...athleteOf(l?.athlete, l?.athlete?.position?.abbreviation ?? ""),
          games,
          avg: {
            HITS: per(st.hits), TB: per(st.totalBases), HRR: per((st.hits ?? 0) + (st.runs ?? 0) + (st.RBIs ?? 0)),
            RUNS: per(st.runs), RBI: per(st.RBIs),
          },
          rank: 1000 + (st.plateAppearances ?? st.atBats ?? 0),
        });
      }
    }
  }
  return rows.sort((a, b) => b.rank - a.rank).map(({ rank, ...p }) => p);
}

/** Fallback before anyone has stats (season openers): the roster, with no averages. */
export function parseRoster(json: any, sport: EspnSport): TeamPlayer[] {
  const groups: any[] = json?.athletes ?? [];
  const athletes =
    sport === "NBA"
      ? groups
      : groups.filter((g) => sport !== "NFL" || g?.position === "offense").flatMap((g) => g?.items ?? []);
  return athletes
    .filter((a) => a?.id && (sport !== "NFL" || NFL_POS.includes(a?.position?.abbreviation)))
    .map((a) => ({ ...athleteOf(a, a?.position?.abbreviation ?? ""), games: 0, avg: {} }));
}

export async function fetchTeamPlayers(sport: EspnSport, teamId: string): Promise<TeamPlayer[]> {
  const base = `${SITE}/${PATHS[sport]}/teams/${encodeURIComponent(teamId)}`;
  const withStats = parseTeamPlayers(await espnJson(`${base}/athletes/statistics`, TTL.players).catch(() => null), sport);
  if (withStats.length) return withStats;
  return parseRoster(await espnJson(`${base}/roster`, TTL.players).catch(() => null), sport);
}

// ---------- Team defense ----------

/** What one team allowed in one game, in GameLog stat fields (pts, reb, passYds, ...). */
export interface Allowed {
  team: string;
  allowed: Record<string, number>;
}

/** NBA scoreboards carry team box totals, so a game gives each side what the other allowed. */
export function nbaAllowed(games: EspnGame[]): Allowed[] {
  const out: Allowed[] = [];
  for (const g of games) {
    if (g.state !== "post" || g.teams.length !== 2 || g.seasonType < 2) continue;
    g.teams.forEach((t, i) => {
      const opp = g.teams[1 - i].stats;
      if (!opp.points) return;
      out.push({
        team: t.abbr,
        allowed: { pts: opp.points, reb: opp.rebounds, ast: opp.assists, fg3m: opp.threePointFieldGoalsMade },
      });
    });
  }
  return out;
}

/** NFL team totals only come with the per-game summary. */
export function nflAllowed(summary: any): Allowed[] {
  const teams: any[] = summary?.boxscore?.teams ?? [];
  if (teams.length !== 2) return [];
  const read = (t: any) => {
    const s: Record<string, string> = {};
    for (const x of t?.statistics ?? []) if (!(x.name in s)) s[x.name] = x.displayValue;
    const [comp, att] = String(s.completionAttempts ?? "0/0").split("/").map(num);
    return { passYds: num(s.netPassingYards), recYds: num(s.netPassingYards), rec: comp, passAtt: att, rushYds: num(s.rushingYards) };
  };
  return teams.map((t, i) => ({ team: canonTeam(t?.team?.abbreviation ?? "", "NFL"), allowed: read(teams[1 - i]) }));
}

/**
 * Turns per-game allowed totals into factors vs league average, shrunk toward 1 by sample size
 * (with `prior` games, a team's number counts half).
 */
export function defenseFactors(sport: EspnSport, rows: Allowed[], prior: number): DefenseFactors {
  const keys = (Object.keys(STATS) as StatKey[]).filter((k) => STATS[k].sport === sport);
  const byTeam = new Map<string, Allowed[]>();
  for (const r of rows) if (r.team) byTeam.set(r.team, [...(byTeam.get(r.team) ?? []), r]);
  const value = (r: Allowed, k: StatKey) => {
    const parts = STATS[k].parts;
    return parts.every((p) => p in r.allowed) ? parts.reduce((s, p) => s + r.allowed[p], 0) : NaN;
  };
  const out: DefenseFactors = {};
  for (const k of keys) {
    const vals = rows.map((r) => value(r, k)).filter(Number.isFinite);
    if (!vals.length) continue;
    const league = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (!league) continue;
    for (const [team, games] of byTeam) {
      const tv = games.map((g) => value(g, k)).filter(Number.isFinite);
      if (!tv.length) continue;
      const raw = tv.reduce((a, b) => a + b, 0) / tv.length / league;
      const w = tv.length / (tv.length + prior);
      (out[team] ??= {})[k] = Math.round((1 + (raw - 1) * w) * 1000) / 1000;
    }
  }
  return out;
}

async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

/** NBA: walk back `days` of daily scoreboards. */
export async function computeNbaDefense(days = 45): Promise<DefenseFactors> {
  const dates = Array.from({ length: days }, (_, i) => espnDate(new Date(Date.now() - (i + 1) * 86400_000)));
  const boards = await inBatches(dates, 8, (d) =>
    fetchScoreboard("NBA", `dates=${d}`, TTL.finished).then((b) => b.games, () => [] as EspnGame[]),
  );
  return defenseFactors("NBA", nbaAllowed(boards.flat()), 8);
}

/** NFL: box scores for every finished regular-season game in the last `weeks` weeks. */
export async function computeNflDefense(weeks = 8): Promise<DefenseFactors> {
  const { week } = await fetchScoreboard("NFL");
  const nums = Array.from({ length: Math.max(0, week) }, (_, i) => week - i).filter((w) => w >= 1).slice(0, weeks);
  const boards = await inBatches(nums, 6, (w) =>
    fetchScoreboard("NFL", `seasontype=2&week=${w}`).then((b) => b.games, () => [] as EspnGame[]),
  );
  const finished = boards.flat().filter((g) => g.state === "post");
  const rows = await inBatches(finished, 8, (g) =>
    espnJson(`${SITE}/${PATHS.NFL}/summary?event=${g.id}`, TTL.finished).then(nflAllowed, () => [] as Allowed[]),
  );
  return defenseFactors("NFL", rows.flat(), 3);
}
