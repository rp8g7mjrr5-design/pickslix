import { project, statValue } from "./model.ts";
import { splits } from "./splits.ts";
import type { PropContext } from "./gameContext.ts";
import type { StatsProvider } from "./providers.ts";
import type { GameLog, Prop, PropWithProjection } from "./types.ts";

export async function buildBoard(
  props: Prop[],
  provider: StatsProvider,
  contexts: Map<string, PropContext> = new Map(),
): Promise<PropWithProjection[]> {
  const [defense, news] = await Promise.all([provider.defense(), provider.news()]);
  const logCache = new Map<string, Promise<GameLog[]>>();
  const logsFor = (prop: Prop) => {
    const key = `${prop.sport}:${prop.player}`;
    if (!logCache.has(key)) logCache.set(key, provider.gameLogs(prop.player, prop.sport, prop.team).catch(() => []));
    return logCache.get(key)!;
  };
  const rows = await Promise.all(
    props.map(async (input) => {
      const ctx = contexts.get(input.id) ?? {};
      const prop = { ...input, gameTime: input.gameTime ?? ctx.gameTime };
      const logs = await logsFor(prop);
      const relevantNews = news.filter((n) => n.team === prop.team || n.team === prop.opponent);
      return {
        ...prop,
        projection: project({ prop, logs, defense, news: relevantNews, market: ctx.market, env: ctx.env, adjust: ctx.adjust }),
        splits: splits(prop, logs, { gameTime: prop.gameTime, home: ctx.home }),
        recent: logs.slice(0, 10).map((g) => statValue(g, prop.stat)),
        recentThisSeason: logs.slice(0, 10).some((g) => g.prior) ? logs.slice(0, 10).filter((g) => !g.prior).length : undefined,
      };
    }),
  );
  return rows.sort((a, b) => b.projection.edge - a.projection.edge);
}
