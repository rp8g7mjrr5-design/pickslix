// NBA teammate-out bumps. When a rotation player is ruled out, their shots, rebounds and assists go to whoever
// is left. Two reads on how much this player picks up: how they have actually done this season in games the
// teammate missed (with/without), and, when that sample is thin, a share of the missing production spread
// across the team in proportion to what each player already does. The with/without read takes over as games
// without the teammate pile up. Pure: the fetching is in usageData.ts.
import type { Adjustment } from "./nflverse.ts";
import { statValue } from "./model.ts";
import { normName } from "./names.ts";
import { STATS, type GameLog, type NewsItem, type StatKey } from "./types.ts";

const NBA_STATS = (Object.keys(STATS) as StatKey[]).filter((k) => STATS[k].sport === "NBA");

/** Only rotation players move the needle: this many of the team's top players by minutes. */
const ROTATION = 8;
/** A teammate needs this many games this season for their share to mean anything. */
const MIN_MATE_GAMES = 2;
/** Share of the missing production the rest of the team picks up (some just goes away: worse shots, slower pace). */
const ABSORB = 0.35;
/** Games without the teammate at which the with/without read and the share read count the same. */
const WITHOUT_HALF = 6;
/** If the teammate missed all of this player's last few games, the recent average already reflects it. */
const ALREADY_OUT_GAMES = 5;
const MATE_CAP: [number, number] = [-0.15, 0.2];
const TOTAL_CAP: [number, number] = [0.85, 1.35];

export interface RosterPlayer {
  name: string;
  games: number;
  avg: Partial<Record<StatKey, number>>;
}

interface Sample {
  n: number;
  avg: Partial<Record<StatKey, number>>;
}

export interface OutMate {
  name: string;
  headline: string;
  /** The teammate's share of the team's season production, by stat. */
  share: Partial<Record<StatKey, number>>;
  /** This player's averages this season in games the teammate played and games they missed. */
  with: Sample;
  without: Sample;
}

/** Everything needed to adjust any NBA stat for one player, so the browser can rescore as the stat changes. */
export type UsageSlice = OutMate[];

const sameName = (a: string, b: string) => normName(a) === normName(b);
const clamp = (x: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, x));

function sample(logs: GameLog[]): Sample {
  const avg: Sample["avg"] = {};
  if (logs.length) for (const k of NBA_STATS) avg[k] = logs.reduce((s, g) => s + statValue(g, k), 0) / logs.length;
  return { n: logs.length, avg };
}

/** Each roster player's share of what the team produced, weighting season averages by games played. */
export function teamShares(roster: RosterPlayer[], player: string): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  const me = roster.find((p) => sameName(p.name, player));
  if (!me) return out;
  for (const k of NBA_STATS) {
    const total = roster.reduce((s, p) => s + (p.avg[k] ?? 0) * p.games, 0);
    if (total > 0) out[k] = ((me.avg[k] ?? 0) * me.games) / total;
  }
  return out;
}

/**
 * Teammates of `player` ruled out for the next game who matter, with this player's with/without numbers.
 * `mateLogs` holds each out teammate's game logs by name; `roster` is the team, most minutes first.
 */
export function buildUsageSlice(
  player: string,
  logs: GameLog[],
  roster: RosterPlayer[],
  news: NewsItem[],
  mateLogs: Map<string, GameLog[]>,
): UsageSlice {
  const played = logs.filter((g) => g.playing > 0 && !g.prior);
  const rotation = roster.slice(0, ROTATION).filter((p) => p.games >= MIN_MATE_GAMES);
  const out: UsageSlice = [];
  for (const n of news) {
    if (n.kind !== "player_out" || sameName(n.player, player)) continue;
    const mate = rotation.find((p) => sameName(p.name, n.player));
    const ml = mateLogs.get(normName(n.player));
    if (!mate || !ml) continue;
    const dates = new Set(ml.filter((g) => g.playing > 0 && !g.prior).map((g) => g.date));
    // Already missing for a while: this player's recent games are the without-them games.
    if (played.length >= ALREADY_OUT_GAMES && played.slice(0, ALREADY_OUT_GAMES).every((g) => !dates.has(g.date))) continue;
    out.push({
      name: mate.name,
      headline: n.headline,
      share: teamShares(roster, mate.name),
      with: sample(played.filter((g) => dates.has(g.date))),
      without: sample(played.filter((g) => !dates.has(g.date))),
    });
  }
  return out;
}

/** The bump for one stat from the teammates who are out. Undefined when nobody who matters is. */
export function usageAdjust(stat: StatKey, slice: UsageSlice | null | undefined): Adjustment | undefined {
  if (!slice?.length || STATS[stat].sport !== "NBA") return undefined;
  let factor = 1;
  const reasons: string[] = [];
  for (const m of slice) {
    const share = m.share[stat] ?? 0;
    const prior = (ABSORB * share) / Math.max(1 - share, 0.5);
    const w = m.with.avg[stat] ?? 0;
    const wo = m.without.avg[stat];
    let boost = prior;
    let how = `${(share * 100).toFixed(0)}% of the team's ${STATS[stat].label.toLowerCase()} to go around`;
    if (wo !== undefined && m.without.n >= 1 && m.with.n >= 3 && w > 0) {
      const seen = wo / w - 1;
      const weight = m.without.n / (m.without.n + WITHOUT_HALF);
      boost = weight * seen + (1 - weight) * prior;
      how = `${wo.toFixed(1)} in ${m.without.n} game${m.without.n === 1 ? "" : "s"} without, ${w.toFixed(1)} with`;
    }
    boost = clamp(boost, MATE_CAP);
    if (Math.abs(boost) < 0.01) continue;
    factor *= 1 + boost;
    reasons.push(`${m.name} is out: ${boost > 0 ? "+" : ""}${(boost * 100).toFixed(0)}% (${how})`);
  }
  if (!reasons.length) return undefined;
  return { factor: clamp(factor, TOTAL_CAP), reasons };
}
