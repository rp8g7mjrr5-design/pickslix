import type { DefenseFactors, GameLog, NewsItem, Prop, Sport, StatKey } from "./types.ts";
import { SAMPLE_DEFENSE, SAMPLE_NEWS, sampleLogs, teamForPlayer } from "./sampleData.ts";
import { fetchGameLogs, fetchInjuries, fetchNhlStarters, findAthlete, findNextGame } from "./espn.ts";
import { canonTeam } from "./names.ts";
import { loadDefense } from "./refresh.ts";

/** A line as pasted: player, stat and number are known; team and opponent may not be. */
export interface LineInput {
  sport: Sport;
  player: string;
  stat: StatKey;
  line: number;
  /** Team abbreviations seen next to the line, if any. */
  teams?: string[];
}

export interface StatsProvider {
  name: string;
  gameLogs(player: string, sport: Sport, team?: string): Promise<GameLog[]>;
  defense(): Promise<DefenseFactors>;
  news(): Promise<NewsItem[]>;
  /** Fill in team, opponent and game time for a pasted line. Null when the player can't be found. */
  resolve(input: LineInput): Promise<Prop | null>;
}

export const propId = (player: string, stat: string) => `custom-${player}-${stat}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Uses whatever team abbreviations came with the paste; the first is taken as the player's team. */
export async function resolveFromPaste(input: LineInput, team?: string): Promise<Prop> {
  const teams = (input.teams ?? []).map((t) => canonTeam(t, input.sport));
  const own = team ?? teams[0] ?? "";
  return {
    id: propId(input.player, input.stat),
    sport: input.sport,
    player: input.player,
    team: own,
    opponent: teams.find((t) => t !== own) ?? "",
    stat: input.stat,
    line: input.line,
  };
}

export const sampleProvider: StatsProvider = {
  name: "sample",
  gameLogs: async (player) => sampleLogs(player),
  defense: async () => SAMPLE_DEFENSE,
  news: async () => SAMPLE_NEWS,
  resolve: async (input) => resolveFromPaste(input, teamForPlayer(input.player)),
};

/**
 * balldontlie.io NBA stats (needs BALLDONTLIE_API_KEY). NFL players fall back to sample logs. Defense and news
 * still come from sample data until those feeds are wired up.
 */
export function balldontlieProvider(apiKey: string, season: number): StatsProvider {
  const base = "https://api.balldontlie.io/v1";
  const get = async (path: string) => {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: apiKey },
      next: { revalidate: 900 },
    });
    if (!res.ok) throw new Error(`balldontlie ${res.status} for ${path}`);
    return res.json();
  };
  return {
    name: "balldontlie",
    async gameLogs(player, sport) {
      if (sport !== "NBA") return sampleLogs(player);
      const found = await get(`/players?search=${encodeURIComponent(player.split(" ").slice(-1)[0])}`);
      const match = found.data.find(
        (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}` === player,
      );
      if (!match) return [];
      const stats = await get(`/stats?player_ids[]=${match.id}&seasons[]=${season}&per_page=100`);
      return stats.data
        .map((s: any) => ({
          date: s.game.date.slice(0, 10),
          opponent: String(s.game.home_team_id === s.team.id ? s.game.visitor_team_id : s.game.home_team_id),
          playing: parseInt(s.min ?? "0", 10) || 0,
          stats: { pts: s.pts ?? 0, reb: s.reb ?? 0, ast: s.ast ?? 0, fg3m: s.fg3m ?? 0 },
        }))
        .sort((a: GameLog, b: GameLog) => b.date.localeCompare(a.date));
    },
    defense: sampleProvider.defense,
    news: sampleProvider.news,
    resolve: sampleProvider.resolve,
  };
}

/**
 * ESPN's public feeds: real NBA and NFL game logs, team defense built from box scores, and the injury report.
 * No key needed.
 */
export const espnProvider: StatsProvider = {
  name: "espn",
  async gameLogs(player, sport, team) {
    const athlete = await findAthlete(player, sport, team ? [team] : []);
    return athlete ? fetchGameLogs(athlete.id, sport) : [];
  },
  async defense() {
    const sports = await Promise.all([loadDefense("NBA"), loadDefense("NFL"), loadDefense("NHL")]);
    // Sports share some abbreviations (DEN, MIA, BOS...), so keep each sport's stat keys on the same team entry.
    const out: DefenseFactors = {};
    for (const factors of sports) for (const [team, f] of Object.entries(factors)) out[team] = { ...out[team], ...f };
    return out;
  },
  async news() {
    const lists = await Promise.allSettled([...(["NBA", "NFL", "NHL", "MLB"] as const).map((s) => fetchInjuries(s)), fetchNhlStarters()]);
    return lists.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  },
  async resolve(input) {
    const hints = (input.teams ?? []).map((t) => canonTeam(t, input.sport));
    const athlete = await findAthlete(input.player, input.sport, hints).catch(() => undefined);
    if (!athlete) {
      // "Points" and "Assists" read as NBA; a hockey player's line ends up here.
      const hockey: Partial<Record<StatKey, StatKey>> = { PTS: "NHL_PTS", AST: "NHL_AST" };
      const alt = input.sport === "NBA" ? hockey[input.stat] : undefined;
      return alt ? espnProvider.resolve({ ...input, sport: "NHL", stat: alt }) : null;
    }
    const prop = await resolveFromPaste({ ...input, player: athlete.name }, athlete.team);
    const game = athlete.team ? await findNextGame(input.sport, athlete.team).catch(() => null) : null;
    if (game) {
      prop.gameTime = game.gameTime;
      prop.opponent ||= game.opponent;
    }
    return prop;
  },
};

/** DATA_SOURCE picks the feed: "espn" (default), "sample", or "balldontlie" (needs BALLDONTLIE_API_KEY). */
export function getProvider(): StatsProvider {
  const source = (process.env.DATA_SOURCE ?? "espn").toLowerCase();
  const key = process.env.BALLDONTLIE_API_KEY;
  if (source === "sample") return sampleProvider;
  if (source === "balldontlie" && key) return balldontlieProvider(key, Number(process.env.NBA_SEASON ?? 2027));
  return espnProvider;
}
