// ESPN's public JSON feeds (no key). These are undocumented, so every parser here is defensive:
// a missing field turns into 0 or gets skipped instead of throwing.
import { canonTeam, normName } from "./names.ts";
import { STATS, type DefenseFactors, type GameLog, type NewsItem, type StatKey } from "./types.ts";

export type EspnSport = "NBA" | "NFL";

const PATHS: Record<EspnSport, string> = { NBA: "basketball/nba", NFL: "football/nfl" };
const SITE = "https://site.api.espn.com/apis/site/v2/sports";
const WEB = "https://site.web.api.espn.com/apis/common/v3";

/** Seconds to cache each kind of response in Next's data cache. */
export const TTL = { search: 7 * 86400, gamelog: 3600, injuries: 900, scoreboard: 600, finished: 7 * 86400 };

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
};

export function parseGameLog(json: any, sport: EspnSport): GameLog[] {
  const names: string[] = json?.names ?? [];
  const col = (n: string) => names.indexOf(n);
  const minutes = col("minutes");
  const fields = Object.entries(COLUMNS[sport]).map(([field, name]) => [field, col(name)] as const);
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
        logs.push({
          date: String(meta.gameDate ?? "").slice(0, 10),
          opponent: canonTeam(meta.opponent?.abbreviation ?? "", sport),
          // ESPN only lists games the player appeared in. NFL logs have no snap counts, so 100 stands for "played".
          playing: sport === "NBA" && minutes >= 0 ? num(row[minutes]) : 100,
          stats,
        });
      }
    }
  }
  return logs.sort((a, b) => b.date.localeCompare(a.date));
}

/** Current season's games, topped up with last season's when it's early in the year. */
export async function fetchGameLogs(athleteId: string, sport: EspnSport, minGames = 15): Promise<GameLog[]> {
  const base = `${WEB}/sports/${PATHS[sport]}/athletes/${athleteId}/gamelog`;
  const current = await espnJson(base, TTL.gamelog);
  const logs = parseGameLog(current, sport);
  const season = Number(current?.filters?.find((f: any) => f?.name === "season")?.value);
  if (logs.length >= minGames || !season) return logs;
  const prev = await espnJson(`${base}?season=${season - 1}`, TTL.finished).catch(() => null);
  return prev ? [...logs, ...parseGameLog(prev, sport)] : logs;
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
  teams: { abbr: string; stats: Record<string, number> }[];
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
