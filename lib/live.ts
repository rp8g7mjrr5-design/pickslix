// Live sweat: how each open pick is doing while its game is on, from ESPN's in-game box score. Pure: the
// fetching is in app/api/live.
import { resultFor } from "./grade.ts";
import { normName } from "./names.ts";
import { STATS, type Sport, type StatKey } from "./types.ts";

export interface LiveBox {
  state: "pre" | "in" | "post";
  /** "Q3 5:32", "Top 6th", "Final". */
  detail: string;
  /** Share of regulation played, 0 to 1. */
  elapsed: number;
  /** "BOS 88, BKN 80", away first. */
  score: string;
  /** Box score stats by normalized player name, in the same fields as game logs. */
  players: Record<string, Record<string, number>>;
}

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** ESPN box score key → our stat field, for every sport. A field can be "a-b" or "a/b"; we take one side. */
const KEYS: Record<string, [field: string, part?: 0 | 1]> = {
  points: ["pts"],
  rebounds: ["reb"],
  totalRebounds: ["reb"],
  assists: ["ast"],
  "threePointFieldGoalsMade-threePointFieldGoalsAttempted": ["fg3m", 0],
  passingYards: ["passYds"],
  passingTouchdowns: ["passTd"],
  "completions/passingAttempts": ["passAtt", 1],
  rushingYards: ["rushYds"],
  receptions: ["rec"],
  receivingYards: ["recYds"],
  goals: ["goals"],
  shotsTotal: ["shots"],
  saves: ["saves"],
  hits: ["hits"],
  runs: ["runs"],
  RBIs: ["rbi"],
};
/** Baseball pitching lines reuse "hits" and "strikeouts", so they get their own map. */
const PITCHING: Record<string, [string, (0 | 1)?]> = {
  hits: ["hitsAllowed"],
  strikeouts: ["k"],
  "fullInnings.partInnings": ["outs"],
};

const outs = (v: string) => {
  const [full, part] = String(v).split(".");
  return num(full) * 3 + num(part);
};

/** Regulation length in periods and minutes per period. */
const LENGTH: Partial<Record<Sport, [periods: number, minutes: number]>> = {
  NBA: [4, 12],
  CBB: [2, 20],
  NFL: [4, 15],
  CFB: [4, 15],
  NHL: [3, 20],
};

/** "5:32" or "45.2" (seconds) → minutes left in the period. */
const clockMinutes = (clock: string) => {
  const [m, s] = clock.includes(":") ? clock.split(":") : ["0", clock];
  return num(m) + num(s) / 60;
};

export function elapsedShare(sport: Sport, state: string, period: number, clock: string, detail: string): number {
  if (state === "post") return 1;
  if (state !== "in" || period < 1) return 0;
  if (sport === "MLB") {
    // Top of an inning is the first half; "Mid" means the top is done, "End" the whole inning.
    const half = /^(bot|mid)/i.test(detail) ? 0.5 : /^end/i.test(detail) ? 1 : 0;
    return Math.min(1, (period - 1 + half) / 9);
  }
  const len = LENGTH[sport];
  if (!len) return 0;
  const [periods, minutes] = len;
  if (period > periods) return 1;
  const left = Math.min(minutes, clockMinutes(clock));
  return Math.min(1, ((period - 1) * minutes + (minutes - left)) / (periods * minutes));
}

export function parseBox(summary: any, sport: Sport): LiveBox {
  const comp = summary?.header?.competitions?.[0] ?? {};
  const status = comp?.status ?? {};
  const state = status?.type?.state === "in" ? "in" : status?.type?.state === "post" ? "post" : "pre";
  const detail = String(status?.type?.shortDetail ?? status?.type?.detail ?? "");
  const teams = (comp?.competitors ?? []) as any[];
  const order = [...teams].sort((a, b) => (a?.homeAway === "away" ? -1 : 1) - (b?.homeAway === "away" ? -1 : 1));
  const score = state === "pre" ? "" : order.map((c) => `${c?.team?.abbreviation ?? ""} ${c?.score ?? 0}`).join(", ");

  const players: LiveBox["players"] = {};
  for (const team of summary?.boxscore?.players ?? []) {
    for (const group of team?.statistics ?? []) {
      const keys: string[] = group?.keys ?? [];
      const map = sport === "MLB" && keys.includes("fullInnings.partInnings") ? PITCHING : KEYS;
      for (const a of group?.athletes ?? []) {
        const name = a?.athlete?.displayName;
        if (!name || a?.didNotPlay) continue;
        const row = (players[normName(name)] ??= {});
        keys.forEach((k, i) => {
          const m = map[k];
          const raw = a?.stats?.[i];
          if (!m || raw === undefined) return;
          const [key, part] = m;
          // Hockey keeps assists in their own field, apart from basketball's.
          const field = key === "ast" && sport === "NHL" ? "assists" : key;
          if (k === "fullInnings.partInnings") row[field] = outs(raw);
          else row[field] = num(part === undefined ? raw : String(raw).split(/[-/]/)[part]);
        });
      }
    }
  }
  return {
    state,
    detail,
    elapsed: elapsedShare(sport, state, Number(status?.period) || 0, String(status?.displayClock ?? ""), detail),
    score,
    players,
  };
}

/** Stats a live box score can't add up yet. */
const NOT_LIVE = new Set<StatKey>(["TB", "SIG_STR", "TD"]);
export const trackable = (stat: StatKey) => !NOT_LIVE.has(stat);

/** Don't project a pace off the first few minutes. */
const MIN_ELAPSED = 0.15;

export type LiveStatus =
  /** Game hasn't started, or the player has no line in the box score yet. */
  | "waiting"
  /** Too early to read anything into it. */
  | "early"
  | "ahead"
  | "behind"
  /** An over already past the line. */
  | "cashed"
  /** An under already past the line. */
  | "busted"
  | "hit"
  | "miss"
  | "push";

export interface LiveLeg {
  state: LiveBox["state"];
  detail: string;
  score: string;
  elapsed: number;
  value: number | null;
  /** Where the player is on pace to finish, once enough of the game is played. */
  pace: number | null;
  status: LiveStatus;
}

export function progress(leg: { player: string; stat: StatKey; line: number; side: "OVER" | "UNDER" }, box: LiveBox): LiveLeg {
  const base = { state: box.state, detail: box.detail, score: box.score, elapsed: box.elapsed };
  const row = box.players[normName(leg.player)];
  if (!row || !trackable(leg.stat)) return { ...base, value: null, pace: null, status: box.state === "post" ? "push" : "waiting" };
  const value = STATS[leg.stat].parts.reduce((t, p) => t + (row[p] ?? 0), 0);
  if (box.state === "post") return { ...base, value, pace: null, status: resultFor(value, leg.line, leg.side) };
  if (leg.side === "OVER" && value > leg.line) return { ...base, value, pace: null, status: "cashed" };
  if (leg.side === "UNDER" && value > leg.line) return { ...base, value, pace: null, status: "busted" };
  if (box.state !== "in" || box.elapsed < MIN_ELAPSED) return { ...base, value, pace: null, status: box.state === "in" ? "early" : "waiting" };
  const pace = Math.round((value / box.elapsed) * 10) / 10;
  const ahead = leg.side === "OVER" ? pace > leg.line : pace < leg.line;
  return { ...base, value, pace, status: ahead ? "ahead" : "behind" };
}
