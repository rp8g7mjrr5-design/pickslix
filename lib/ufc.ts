// UFC props: significant strikes and takedowns. A fighter's count depends on two things: how fast they land
// (per minute, which is steady from fight to fight) and how long the fight lasts (which isn't: a first-round
// finish ends every over). So the projection is the fighter's landing rate times the fight's expected length,
// with the spread of a fight that might end early folded into the variance. How often each fighter's fights
// end before the final bell sets the chance of an early finish. Pure: fetching is in ufcData.ts.
//
// ESPN pieces: a year's scoreboard lists every fight (date, scheduled rounds, the round and clock it ended,
// both fighters), and a fighter's stats page lists landed/attempted strikes and takedowns per fight.
import type { GameLog } from "./types.ts";

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export interface FightMeta {
  /** Competition (single fight) id. */
  id: string;
  date: string;
  /** Scheduled rounds: 3, or 5 for main events and title fights. */
  rounds: number;
  /** Minutes actually fought; undefined until it's over. */
  minutes?: number;
  state: "pre" | "in" | "post";
  fighters: { id: string; name: string; winner?: boolean; record?: string }[];
}

/** Every fight on a UFC scoreboard (one event, or a whole year with ?dates=YYYY). */
export function parseFights(json: any): FightMeta[] {
  const out: FightMeta[] = [];
  for (const ev of json?.events ?? []) {
    for (const c of ev?.competitions ?? []) {
      const status = c?.status ?? {};
      const state = status?.type?.state ?? "pre";
      const rounds = num(c?.format?.regulation?.periods) || 3;
      const fighters = (c?.competitors ?? [])
        .map((x: any) => ({
          id: String(x?.id ?? x?.athlete?.id ?? ""),
          name: String(x?.athlete?.displayName ?? ""),
          ...(typeof x?.winner === "boolean" ? { winner: x.winner } : {}),
          ...(x?.records?.[0]?.summary ? { record: String(x.records[0].summary) } : {}),
        }))
        .filter((f: any) => f.id && f.name);
      if (fighters.length !== 2) continue;
      out.push({
        id: String(c?.id ?? ""),
        date: String(c?.date ?? ev?.date ?? ""),
        rounds,
        // ESPN's clock is the time elapsed in the final round.
        minutes: state === "post" && num(status?.period) > 0 ? (num(status.period) - 1) * 5 + num(status.clock) / 60 : undefined,
        state,
        fighters,
      });
    }
  }
  return out;
}

export interface FightStats {
  sigStr: number;
  sigAtt: number;
  td: number;
  tdAtt: number;
  kd: number;
}

/** A fighter's per-fight numbers from their stats page, by competition id. */
export function parseFighterStats(json: any): Map<string, FightStats> {
  const out = new Map<string, Partial<FightStats>>();
  const want: Record<string, keyof FightStats> = { SSL: "sigStr", SSA: "sigAtt", KD: "kd", TDL: "td", TDA: "tdAtt" };
  for (const cat of json?.categories ?? []) {
    const labels: string[] = (cat?.labels ?? []).map((l: string) => String(l).trim());
    for (const row of cat?.statistics ?? []) {
      const comp = /~c:(\d+)/.exec(String(row?.uid ?? ""))?.[1];
      if (!comp) continue;
      const entry = out.get(comp) ?? {};
      labels.forEach((label, i) => {
        const field = want[label];
        if (field) entry[field] = num(row?.stats?.[i]);
      });
      out.set(comp, entry);
    }
  }
  return new Map([...out].map(([k, v]) => [k, { sigStr: 0, sigAtt: 0, td: 0, tdAtt: 0, kd: 0, ...v }]));
}

/** What the board and cards call a fighter: the last name ("Moicano"). */
export function fighterTag(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : name.trim();
}

/**
 * One GameLog per finished UFC fight with stats, newest first. `playing` is minutes fought, `stats.rounds` the
 * scheduled rounds (to tell a finish from a decision).
 */
export function fightLogs(athleteId: string, stats: Map<string, FightStats>, fights: Map<string, FightMeta>): GameLog[] {
  const logs: GameLog[] = [];
  for (const [comp, s] of stats) {
    const f = fights.get(comp);
    const me = f?.fighters.find((x) => x.id === athleteId);
    const opp = f?.fighters.find((x) => x.id !== athleteId);
    if (!f || !me || !opp || f.minutes === undefined) continue;
    logs.push({
      date: f.date.slice(0, 10),
      opponent: fighterTag(opp.name),
      playing: Math.round(f.minutes * 100) / 100,
      // comp and oppId (numeric ids) let the opponent's side of the fight be looked up for what this fighter absorbed.
      stats: { sigStr: s.sigStr, sigAtt: s.sigAtt, td: s.td, tdAtt: s.tdAtt, kd: s.kd, rounds: f.rounds, won: me.winner ? 1 : 0, comp: Number(comp), oppId: Number(opp.id) },
    });
  }
  return logs.sort((a, b) => b.date.localeCompare(a.date));
}

/** The fight today's prop is about: scheduled rounds and the opponent's history. */
export interface UfcInput {
  rounds: number;
  opponent: GameLog[];
}

/**
 * Add what the fighter absorbed in each fight (their opponent's landed strikes and takedowns), from the
 * opponents' own stats pages: `theirs` maps opponent id → that opponent's per-fight stats.
 */
export function withAbsorbed(logs: GameLog[], theirs: Map<string, Map<string, FightStats>>): GameLog[] {
  return logs.map((g) => {
    const s = theirs.get(String(g.stats.oppId))?.get(String(g.stats.comp));
    return s ? { ...g, stats: { ...g.stats, sigStrAbs: s.sigStr, tdAbs: s.td } } : g;
  });
}

/** League landing rates per fighter-minute (ESPN, 2025 UFC fights). */
const LEAGUE_RATE: Record<string, number> = { sigStr: 3.7, td: 0.125 };
/** Minutes of league-average defense mixed in before trusting a fighter's own. */
const DEFENSE_PRIOR_MIN = 30;
/** How much of the opponent's leakiness carries over (the rest is the fighter's own style). */
const DEFENSE_WEIGHT = 0.6;
const DEFENSE_CAP: [number, number] = [0.75, 1.3];

/** How much more (or less) than average the opponent gives up per minute, shrunk toward average. */
export function opponentFactor(field: string, opp: GameLog[]): { factor: number; reason?: string } {
  const league = LEAGUE_RATE[field];
  const fights = opp.slice(0, MAX_FIGHTS).filter((g) => g.stats[`${field}Abs`] !== undefined && g.playing > 0);
  if (!league || !fights.length) return { factor: 1 };
  const absorbed = fights.reduce((a, g) => a + g.stats[`${field}Abs`], 0);
  const minutes = fights.reduce((a, g) => a + g.playing, 0);
  const rate = (absorbed + league * DEFENSE_PRIOR_MIN) / (minutes + DEFENSE_PRIOR_MIN);
  const factor = Math.min(DEFENSE_CAP[1], Math.max(DEFENSE_CAP[0], (rate / league) ** DEFENSE_WEIGHT));
  if (Math.abs(factor - 1) < 0.02) return { factor };
  const what = field === "td" ? "takedowns" : "significant strikes";
  return {
    factor,
    reason: `Opponent absorbs ${(absorbed / minutes).toFixed(field === "td" ? 2 : 1)} ${what} per minute (average ${league}) over ${fights.length} fights: ${factor > 1 ? "+" : ""}${((factor - 1) * 100).toFixed(0)}%`,
  };
}

/** Share of fights that end early, before any fighter history. */
const PRIOR_FINISH = 0.45;
const PRIOR_FIGHTS = 4;
/** Fight-to-fight spread in a count at a fixed fight length, as variance over mean. */
const DISPERSION: Record<string, number> = { sigStr: 1.8, td: 1.4 };
const HALF_LIFE_FIGHTS = 4;
const MAX_FIGHTS = 10;

const finished = (g: GameLog) => g.playing < (g.stats.rounds ?? 3) * 5 - 0.05;

/** Chance this fight ends before the final bell, from both fighters' recent fights. */
export function finishChance(me: GameLog[], opp: GameLog[]): number {
  const recent = [...me.slice(0, MAX_FIGHTS), ...opp.slice(0, MAX_FIGHTS)];
  return (recent.filter(finished).length + PRIOR_FINISH * PRIOR_FIGHTS) / (recent.length + PRIOR_FIGHTS);
}

/** Recency-weighted landing rate per minute. */
export function perMinute(logs: GameLog[], field: string): number {
  let num = 0;
  let den = 0;
  logs.slice(0, MAX_FIGHTS).forEach((g, i) => {
    const w = 0.5 ** (i / HALF_LIFE_FIGHTS);
    num += w * (g.stats[field] ?? 0);
    den += w * g.playing;
  });
  return den > 0 ? num / den : 0;
}

/**
 * Mean and variance of a fighter's count tonight: rate × fight length, where the fight goes the distance or,
 * with the finish chance, stops at a uniformly random point before it.
 */
export function ufcBase(field: string, logs: GameLog[], ufc?: UfcInput): { mean: number; variance: number; reasons: string[] } {
  const rounds = ufc?.rounds ?? 3;
  const full = rounds * 5;
  const pf = finishChance(logs, ufc?.opponent ?? []);
  const defense = opponentFactor(field, ufc?.opponent ?? []);
  const own = perMinute(logs, field);
  const rate = own * defense.factor;
  const t1 = pf * (full / 2) + (1 - pf) * full;
  const t2 = pf * (full * full / 3) + (1 - pf) * full * full;
  const mean = rate * t1;
  const variance = mean * (DISPERSION[field] ?? 1.5) + rate * rate * (t2 - t1 * t1);
  const what = field === "td" ? "takedowns" : "significant strikes";
  return {
    mean,
    variance: Math.max(variance, mean),
    reasons: [
      `Lands ${own.toFixed(field === "td" ? 2 : 1)} ${what} per minute over ${Math.min(logs.length, MAX_FIGHTS)} recent fights`,
      `${rounds}-round fight, ${(pf * 100).toFixed(0)}% chance it ends early from both fighters' records: expect about ${t1.toFixed(1)} of ${full} minutes`,
      ...(defense.reason ? [defense.reason] : []),
    ],
  };
}
