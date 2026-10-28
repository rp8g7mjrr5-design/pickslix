// Situational splits: how often a player cleared today's line in games like today's (same opponent, home or
// away, rest, recent form). The props version of "this matchup mirrors a pattern from the archive". Samples
// are small, so a split only counts as a pattern when it's lopsided over enough games, and the model doesn't
// use them; they're shown next to the number so people can see what's behind a hot or cold streak.
import { statValue } from "./model.ts";
import type { GameLog, Prop, Split } from "./types.ts";

export type { Split };

/** At least this many games and this share one way before a split is called a pattern. */
const PATTERN_GAMES = 4;
const PATTERN_SHARE = 0.75;

const DAY = 86400_000;

function tally(key: Split["key"], label: string, logs: GameLog[], prop: Prop): Split {
  const values = logs.map((g) => statValue(g, prop.stat));
  const over = values.filter((v) => v > prop.line).length;
  const under = values.filter((v) => v < prop.line).length;
  const n = values.length;
  let pattern: Split["pattern"];
  if (n >= PATTERN_GAMES) {
    if (over / n >= PATTERN_SHARE) pattern = "OVER";
    else if (under / n >= PATTERN_SHARE) pattern = "UNDER";
  }
  return { key, label, over, under, n, pattern };
}

/** Days off before each game; logs are newest first. */
function restBefore(logs: GameLog[], i: number): number | undefined {
  const prev = logs[i + 1];
  if (!prev) return undefined;
  return Math.round((Date.parse(logs[i].date) - Date.parse(prev.date)) / DAY) - 1;
}

/**
 * Splits for one prop at its line. `home` is whether today's game is at home; `gameTime` dates it so rest
 * can be worked out (only NBA and NHL play on back-to-back nights often enough for rest to matter).
 */
export function splits(prop: Prop, logs: GameLog[], opts: { home?: boolean; gameTime?: string } = {}): Split[] {
  const played = logs.filter((g) => g.playing > 0);
  const season = played.filter((g) => !g.prior);
  const out: Split[] = [];
  if (played.length >= 3) out.push(tally("last5", `Last ${Math.min(5, played.length)}`, played.slice(0, 5), prop));
  if (season.length >= 6) out.push(tally("season", "This season", season, prop));

  // Same opponent: every logged game against them, last season's included, since matchups are rare.
  const vs = played.filter((g) => g.opponent && g.opponent === prop.opponent);
  if (prop.opponent && vs.length) out.push(tally("opp", `vs ${prop.opponent}`, vs, prop));

  if (opts.home !== undefined) {
    const same = season.filter((g) => g.home === opts.home);
    if (same.length >= 3) out.push(tally("venue", opts.home ? "At home" : "On the road", same, prop));
  }

  if ((prop.sport === "NBA" || prop.sport === "NHL") && opts.gameTime && played[0]) {
    // Log dates are the UTC day of tip-off, so compare against the UTC day of today's game.
    const restToday = Math.round((Date.parse(opts.gameTime.slice(0, 10)) - Date.parse(played[0].date)) / DAY) - 1;
    if (restToday === 0) {
      const b2b = played.filter((_, i) => restBefore(played, i) === 0);
      if (b2b.length >= 2) out.push(tally("rest", "2nd of back-to-back", b2b, prop));
    }
  }
  return out;
}

/** The strongest called-out pattern, for a one-line summary. */
export function topPattern(list: Split[]): Split | undefined {
  return list
    .filter((s) => s.pattern && s.key !== "season")
    .sort((a, b) => Math.max(b.over, b.under) / b.n - Math.max(a.over, a.under) / a.n || b.n - a.n)[0];
}
