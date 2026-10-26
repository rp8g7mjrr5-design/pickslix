import { project, statValue } from "./model.ts";
import type { StatsProvider } from "./providers.ts";
import type { GameLog, Prop, PropWithProjection } from "./types.ts";

export async function buildBoard(props: Prop[], provider: StatsProvider): Promise<PropWithProjection[]> {
  const [defense, news] = await Promise.all([provider.defense(), provider.news()]);
  const logCache = new Map<string, Promise<GameLog[]>>();
  const logsFor = (player: string, sport: Prop["sport"]) => {
    if (!logCache.has(player)) logCache.set(player, provider.gameLogs(player, sport).catch(() => []));
    return logCache.get(player)!;
  };
  const rows = await Promise.all(
    props.map(async (prop) => {
      const logs = await logsFor(prop.player, prop.sport);
      const relevantNews = news.filter((n) => n.team === prop.team || n.team === prop.opponent);
      return {
        ...prop,
        projection: project({ prop, logs, defense, news: relevantNews }),
        recent: logs.slice(0, 10).map((g) => statValue(g, prop.stat)),
      };
    }),
  );
  return rows.sort((a, b) => b.projection.edge - a.projection.edge);
}
