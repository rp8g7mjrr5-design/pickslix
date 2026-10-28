/** CFB is FBS college football and CBB Division I men's college basketball. */
export type Sport = "NBA" | "NFL" | "MLB" | "NHL" | "CFB" | "CBB" | "UFC";

export const SPORTS: Sport[] = ["NBA", "NFL", "NHL", "MLB", "CFB", "CBB", "UFC"];

/** College lines use the pro stat menu and box score: CFB takes NFL's stats, CBB takes NBA's. */
const STAT_SPORT: Record<Sport, Sport> = { NBA: "NBA", NFL: "NFL", NHL: "NHL", MLB: "MLB", CFB: "NFL", CBB: "NBA", UFC: "UFC" };
export const statSport = (s: Sport): Sport => STAT_SPORT[s];
export const isCollege = (s: Sport) => STAT_SPORT[s] !== s;
export const toSport = (v: unknown): Sport => (SPORTS.includes(v as Sport) ? (v as Sport) : "NBA");

export interface StatDef {
  label: string;
  /** The pro sport; college sports share it (see statSport). */
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
  // UFC (lib/ufc.ts)
  SIG_STR: { label: "Significant Strikes", sport: "UFC", parts: ["sigStr"] },
  TD: { label: "Takedowns", sport: "UFC", parts: ["td"] },
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
  /** Minutes (NBA, NHL, UFC) or offensive snap share 0-100 (NFL). 0 means did not play. */
  playing: number;
  stats: Record<string, number>;
  /** From last season, filled in early in the year. Counts for less in the model. */
  prior?: boolean;
  /** Played at home, when the feed says. */
  home?: boolean;
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
  | "opponent_out"
  /** NHL: who starts in goal next game (from ESPN's probables). */
  | "starting_goalie";

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
  /** For starting_goalie: the team has confirmed it (otherwise it's the probable starter). */
  confirmed?: boolean;
}

export interface Projection {
  propId: string;
  mean: number;
  pOver: number;
  pUnder: number;
  pPush: number;
  pick: "OVER" | "UNDER";
  pickProb: number;
  /** pOver and pUnder before tuning on graded results; what tuning learns from. */
  rawPOver?: number;
  rawPUnder?: number;
  /** pickProb - 0.5, the edge over a coin flip. */
  edge: number;
  confidence: "low" | "medium" | "high";
  sampleSize: number;
  /** Games from this season in the sample. */
  thisSeason?: number;
  hitRateLast10: number;
  reasons: string[];
  status: "ok" | "out";
  /** Injury report status for this player, if listed. */
  injury?: "out" | "questionable";
  /** The stats-only projection, before it's pulled toward the line or the market. */
  modelMean?: number;
  /** The mean the sportsbooks' price implies, when they've priced this prop. */
  marketMean?: number;
  /** The books' chance for `pick` at the Pick 6 line, when they've priced this prop. */
  marketProb?: number;
  /** The books' price itself (no-vig over at their line), saved with picks for the closing-line check. */
  market?: { line: number; pOver: number };
  /** Variance over mean of the projection, to restate a price at another line. */
  dispersion?: number;
}

/** How often a player cleared the line in games like this one (`lib/splits.ts`). */
export interface Split {
  key: "last5" | "season" | "opp" | "venue" | "rest";
  label: string;
  /** Games that cleared the line (over). */
  over: number;
  /** Games that stayed under it. Pushes are in neither. */
  under: number;
  n: number;
  /** Lopsided enough over enough games to call out. */
  pattern?: "OVER" | "UNDER";
}

export interface PropWithProjection extends Prop {
  projection: Projection;
  splits?: Split[];
  recent: number[];
  /** How many of `recent` (newest first) are from this season, when some are from last season. */
  recentThisSeason?: number;
}
