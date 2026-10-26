import type { DefenseFactors, GameLog, NewsItem, Sport } from "./types.ts";
import { SAMPLE_DEFENSE, SAMPLE_NEWS, sampleLogs } from "./sampleData.ts";

export interface StatsProvider {
  name: string;
  gameLogs(player: string, sport: Sport): Promise<GameLog[]>;
  defense(): Promise<DefenseFactors>;
  news(): Promise<NewsItem[]>;
}

export const sampleProvider: StatsProvider = {
  name: "sample",
  gameLogs: async (player) => sampleLogs(player),
  defense: async () => SAMPLE_DEFENSE,
  news: async () => SAMPLE_NEWS,
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
  };
}

export function getProvider(): StatsProvider {
  const key = process.env.BALLDONTLIE_API_KEY;
  if (key) return balldontlieProvider(key, Number(process.env.NBA_SEASON ?? 2026));
  return sampleProvider;
}
