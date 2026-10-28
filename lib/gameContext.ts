// What the board needs to know about each pasted line's game beyond the player's own stats: whether the
// team is at home, the spread and total, the sportsbooks' price for that prop, and NFL role trends or NBA
// teammates ruled out.
import { fetchGameLogs, fetchInjuries, fetchUpcomingGames, findAthlete, type EspnGame } from "./espn.ts";
import type { MarketInput } from "./model.ts";
import { loadNflContext } from "./nflData.ts";
import { nflAdjust, nflSlice, type Adjustment, type NflContext } from "./nflverse.ts";
import { normName } from "./names.ts";
import { fetchGameLines, fetchSlate, oddsEnabled, teamEnv, type GameLines, type Slate, type TeamEnv } from "./odds.ts";
import type { NewsItem, Prop, Sport } from "./types.ts";
import type { UfcInput } from "./ufc.ts";
import { usageAdjust, type UsageSlice } from "./usage.ts";
import { loadUsage } from "./usageData.ts";

export interface PropContext {
  home?: boolean;
  env?: TeamEnv;
  market?: MarketInput;
  gameTime?: string;
  adjust?: Adjustment;
  ufc?: UfcInput;
}

/**
 * Context for each prop, by prop id. `spend` allows fetching prop lines that aren't cached yet (they cost
 * credits, so only for Pro); spreads and totals are cheap and shared, so they're always fetched.
 */
export async function propContexts(props: Prop[], opts: { spend: boolean }): Promise<Map<string, PropContext>> {
  const out = new Map<string, PropContext>();
  const sports = [...new Set(props.map((p) => p.sport))];
  const games = new Map<Sport, EspnGame[]>();
  const slates = new Map<Sport, Slate | null>();
  await Promise.all(
    sports.map(async (s) => {
      games.set(s, await fetchUpcomingGames(s).catch(() => []));
      slates.set(s, oddsEnabled() ? await fetchSlate(s).catch(() => null) : null);
    }),
  );
  const nfl: NflContext | null = sports.includes("NFL") ? await loadNflContext().catch(() => null) : null;
  const injuries: NewsItem[] = sports.includes("NBA") ? await fetchInjuries("NBA").catch(() => []) : [];
  const usageCache = new Map<string, Promise<UsageSlice>>();
  const usageFor = (player: string, team: string, teamId?: string) => {
    const key = `${player}:${team}`;
    if (!usageCache.has(key)) {
      const load = async () => {
        if (!injuries.some((n) => n.team === team && n.kind === "player_out")) return [];
        const athlete = await findAthlete(player, "NBA", [team]);
        const logs = athlete ? await fetchGameLogs(athlete.id, "NBA") : [];
        return loadUsage({ player: athlete?.name ?? player, team, logs, teamId, news: injuries });
      };
      usageCache.set(key, load().catch(() => []));
    }
    return usageCache.get(key)!;
  };
  const lineCache = new Map<string, Promise<GameLines>>();
  await Promise.all(
    props.map(async (prop) => {
      const game = games
        .get(prop.sport)
        ?.find((g) => g.teams.some((t) => t.abbr === prop.team) && (!prop.opponent || g.teams.some((t) => t.abbr === prop.opponent)));
      const me = game?.teams.find((t) => t.abbr === prop.team);
      const home = game?.teams.find((t) => t.home);
      const away = game?.teams.find((t) => !t.home);
      if (!game || !me || !home || !away) return;
      const [homeName, awayName] = [home.name || home.abbr, away.name || away.abbr];
      const ctx: PropContext = { home: Boolean(me.home), gameTime: game.date };
      ctx.env = teamEnv(slates.get(prop.sport) ?? null, homeName, awayName, game.date, Boolean(me.home));
      if (oddsEnabled()) {
        if (!lineCache.has(game.id)) {
          lineCache.set(game.id, fetchGameLines(prop.sport, homeName, awayName, game.date, opts).catch(() => ({})));
        }
        const m = (await lineCache.get(game.id)!)[normName(prop.player)]?.[prop.stat]?.market;
        if (m) ctx.market = m;
      }
      if (nfl && prop.sport === "NFL") {
        const opponent = prop.opponent || (me === home ? away.abbr : home.abbr);
        ctx.adjust = nflAdjust({ ...prop, opponent }, nflSlice(nfl, prop.player, opponent));
      }
      if (prop.sport === "UFC") {
        const opp = game.teams.find((t) => t !== me);
        const rounds = game.teams[0].stats.rounds || 3;
        ctx.ufc = { rounds, opponent: opp?.id ? await fetchGameLogs(opp.id, "UFC").catch(() => []) : [] };
      }
      if (prop.sport === "NBA") ctx.adjust = usageAdjust(prop.stat, await usageFor(prop.player, prop.team, me.id));
      out.set(prop.id, ctx);
    }),
  );
  return out;
}
