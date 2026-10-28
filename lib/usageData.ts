// Fetching for the NBA teammate-out bumps in usage.ts: the team's players (season averages, most minutes
// first), today's injury report, and the game logs of whoever is out. All of it is in Next's fetch cache.
import { fetchGameLogs, fetchInjuries, fetchTeamPlayers, fetchUpcomingGames } from "./espn.ts";
import { normName } from "./names.ts";
import type { GameLog, NewsItem } from "./types.ts";
import { buildUsageSlice, type UsageSlice } from "./usage.ts";

/**
 * Out teammates of an NBA player and what that means for this player. `teamId` is ESPN's; when it isn't known it's looked
 * up from the next few days' games. `news` can be passed in when the caller already has the injury report.
 */
export async function loadUsage(opts: {
  player: string;
  team: string;
  logs: GameLog[];
  teamId?: string;
  news?: NewsItem[];
}): Promise<UsageSlice> {
  const news = (opts.news ?? (await fetchInjuries("NBA"))).filter((n) => n.team === opts.team && n.kind === "player_out");
  if (!news.length || !opts.team) return [];
  let teamId = opts.teamId;
  if (!teamId) {
    const games = await fetchUpcomingGames("NBA");
    teamId = games.flatMap((g) => g.teams).find((t) => t.abbr === opts.team)?.id;
  }
  if (!teamId) return [];
  const roster = await fetchTeamPlayers("NBA", teamId);
  const out = new Set(news.map((n) => normName(n.player)));
  const mates = roster.slice(0, 10).filter((p) => out.has(normName(p.name)));
  const mateLogs = new Map<string, GameLog[]>();
  await Promise.all(
    mates.map(async (m) => mateLogs.set(normName(m.name), await fetchGameLogs(m.id, "NBA").catch(() => []))),
  );
  return buildUsageSlice(opts.player, opts.logs, roster, news, mateLogs);
}
