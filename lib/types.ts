export type Sport = "NBA" | "NFL" | "MLB" | "NHL";

export const SPORTS: Sport[] = ["NBA", "NFL", "NHL", "MLB"];
export const toSport = (v: unknown): Sport => (SPORTS.includes(v as Sport) ? (v as Sport) : "NBA");

export interface StatDef {
  label: string;
  sport: Sport;
  /** Box-score fields summed to get this stat, e.g. PRA = pts + reb + ast. */
  parts: string[];
}

export const STATS = {
  // NBA
  PTS: { label: "Points", sport: "NBA", parts: ["pts"] },
  REB: { label: "Rebounds", sport: "NBA", parts: ["reb"] },
  AST: { label: "Assists", sport: "NBA", parts: ["ast"] },
  "3PM": { label: "3-Pointers Made", sport: "NBA", parts: ["fg3m"] },
  PRA: { label: "Pts + Reb + Ast", sport: "NBA", parts: ["pts", "reb", "ast"] },
  PR: { label: "Pts + Reb", sport: "NBA", parts: ["pts", "reb"] },
  PA: { label: "Pts + Ast", sport: "NBA", parts: ["pts", "ast"] },
  RA: { label: "Reb + Ast", sport: "NBA", parts: ["reb", "ast"] },
  // NFL
  PASS_YDS: { label: "Passing Yards", sport: "NFL", parts: ["passYds"] },
  PASS_TD: { label: "Passing TDs", sport: "NFL", parts: ["passTd"] },
  PASS_ATT: { label: "Pass Attempts", sport: "NFL", parts: ["passAtt"] },
  RUSH_YDS: { label: "Rushing Yards", sport: "NFL", parts: ["rushYds"] },
  REC: { label: "Receptions", sport: "NFL", parts: ["rec"] },
  REC_YDS: { label: "Receiving Yards", sport: "NFL", parts: ["recYds"] },
  RUSH_REC_YDS: { label: "Rush + Rec Yards", sport: "NFL", parts: ["rushYds", "recYds"] },
  // NHL
  SOG: { label: "Shots on Goal", sport: "NHL", parts: ["shots"] },
  GOALS: { label: "Goals", sport: "NHL", parts: ["goals"] },
  NHL_AST: { label: "Hockey Assists", sport: "NHL", parts: ["assists"] },
  NHL_PTS: { label: "Hockey Points", sport: "NHL", parts: ["goals", "assists"] },
  SAVES: { label: "Goalie Saves", sport: "NHL", parts: ["saves"] },
  // MLB
  HITS: { label: "Hits", sport: "MLB", parts: ["hits"] },
  TB: { label: "Total Bases", sport: "MLB", parts: ["tb"] },
  HRR: { label: "Hits + Runs + RBIs", sport: "MLB", parts: ["hits", "runs", "rbi"] },
  RUNS: { label: "Runs", sport: "MLB", parts: ["runs"] },
  RBI: { label: "RBIs", sport: "MLB", parts: ["rbi"] },
  K: { label: "Pitcher Strikeouts", sport: "MLB", parts: ["k"] },
  HITS_ALLOWED: { label: "Hits Allowed", sport: "MLB", parts: ["hitsAllowed"] },
  OUTS: { label: "Pitching Outs", sport: "MLB", parts: ["outs"] },
} satisfies Record<string, StatDef>;

export type StatKey = keyof typeof STATS;

/** One line offered on Pick 6. */
export interface Prop {
  id: string;
  sport: Sport;
  player: string;
  team: string;
  opponent: string;
  stat: StatKey;
  line: number;
  gameTime?: string;
}

export interface GameLog {
  date: string;
  opponent: string;
  /** Minutes (NBA) or offensive snap share 0-100 (NFL). 0 means did not play. */
  playing: number;
  stats: Record<string, number>;
}

/**
 * How much an opponent allows of a stat relative to league average.
 * 1.08 means they give up 8% more than average.
 */
export type DefenseFactors = Record<string, Partial<Record<StatKey, number>>>;

export type NewsKind =
  | "player_out"
  | "player_questionable"
  | "minutes_limit"
  | "teammate_out"
  | "opponent_out";

export interface NewsItem {
  id: string;
  date: string;
  player: string;
  team: string;
  kind: NewsKind;
  headline: string;
  /** For teammate_out / opponent_out: who is affected (player names). */
  affects?: string[];
  /** For teammate_out: fractional usage bump to apply, e.g. 0.06. */
  usageBoost?: number;
  /** For minutes_limit: expected minutes. */
  minutes?: number;
}

export interface Projection {
  propId: string;
  mean: number;
  pOver: number;
  pUnder: number;
  pPush: number;
  pick: "OVER" | "UNDER";
  pickProb: number;
  /** pickProb - 0.5, the edge over a coin flip. */
  edge: number;
  confidence: "low" | "medium" | "high";
  sampleSize: number;
  hitRateLast10: number;
  reasons: string[];
  status: "ok" | "out";
  /** Injury report status for this player, if listed. */
  injury?: "out" | "questionable";
}

export interface PropWithProjection extends Prop {
  projection: Projection;
  recent: number[];
}
