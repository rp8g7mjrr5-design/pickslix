// Settles saved sportsbook bets: game lines from ESPN's final scores, props from the player's box score (lib/grade.ts).
import { gradeGame, type BetLeg, type LegResult } from "./bets.ts";
import { espnDate, fetchScoreboard, TTL, type EspnGame } from "./espn.ts";
import { gradeLegDetail } from "./grade.ts";
import { sameTeam } from "./odds.ts";

const DAY = 86400_000;

/** The final for a game between these book names (full team names) starting around `start`, or null. */
export function findFinal(games: EspnGame[], home: string, away: string): EspnGame | undefined {
  return games.find((g) => {
    const h = g.teams.find((t) => t.home);
    const a = g.teams.find((t) => !t.home);
    return h && a && sameTeam(home, h.name || h.abbr) && sameTeam(away, a.name || a.abbr);
  });
}

export async function gradeBetLeg(leg: BetLeg): Promise<{ result: LegResult; actual?: string } | null> {
  const start = Date.parse(leg.start);
  if (!Number.isFinite(start) || start > Date.now()) return null;
  if (leg.kind === "prop") {
    if (!leg.player || !leg.stat || leg.line === undefined || !leg.pick) return null;
    const g = await gradeLegDetail({ player: leg.player, stat: leg.stat, line: leg.line, side: leg.pick, sport: leg.sport, team: leg.team, gameTime: leg.start, savedAt: leg.start });
    return g ? { result: g.result, actual: g.value !== undefined ? String(g.value) : undefined } : null;
  }
  if (!leg.home || !leg.away || !leg.market) return null;
  // ESPN's scoreboard days are US dates; an evening start in UTC can be the day before.
  const days = [...new Set([espnDate(new Date(start - DAY / 2)), espnDate(new Date(start))])];
  for (const d of days) {
    const { games } = await fetchScoreboard(leg.sport, `dates=${d}`, TTL.scoreboard).catch(() => ({ games: [] as EspnGame[] }));
    const g = findFinal(games, leg.home, leg.away);
    if (!g) continue;
    if (g.state !== "post") return null;
    const h = g.teams.find((t) => t.home)!;
    const a = g.teams.find((t) => !t.home)!;
    if (h.score === undefined || a.score === undefined) return null;
    return { result: gradeGame(leg, h.score, a.score), actual: `${a.abbr} ${a.score}, ${h.abbr} ${h.score}` };
  }
  return null;
}
