import { project, statValue } from "./model.ts";
import type { StatsProvider } from "./providers.ts";
import type { GameLog, Prop, PropWithProjection } from "./types.ts";

export async function buildBoard(props: Prop[], provider: StatsProvider): Promise<PropWithProjection[]> {
  const [defense, news] = await Promise.all([provider.defense(), provider.news()]);
  const logCache = new Map<string, Promise<GameLog[]>>();
  const logsFor = (prop: Prop) => {
    const key = `${prop.sport}:${prop.player}`;
    if (!logCache.has(key)) logCache.set(key, provider.gameLogs(prop.player, prop.sport, prop.team).catch(() => []));
    return logCache.get(key)!;
  };
  const rows = await Promise.all(
    props.map(async (prop) => {
      const logs = await logsFor(prop);
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
