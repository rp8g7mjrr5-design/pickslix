// Sample data so the app runs without API keys. Game logs are generated, not real stats.
import type { DefenseFactors, GameLog, NewsItem, Prop, Sport } from "./types.ts";

interface Profile {
  player: string;
  team: string;
  sport: Sport;
  /** Typical minutes (NBA) or snap share (NFL). */
  playing: number;
  means: Record<string, number>;
}

const nba = (player: string, team: string, minutes: number, pts: number, reb: number, ast: number, fg3m: number): Profile => ({
  player, team, sport: "NBA", playing: minutes, means: { pts, reb, ast, fg3m },
});
const nfl = (player: string, team: string, snaps: number, means: Record<string, number>): Profile => ({
  player, team, sport: "NFL", playing: snaps, means,
});

const PROFILES: Profile[] = [
  nba("Shai Gilgeous-Alexander", "OKC", 34, 31, 5.2, 6.3, 2.1),
  nba("Jalen Williams", "OKC", 32, 20, 5.5, 5.1, 1.6),
  nba("Nikola Jokic", "DEN", 36, 28, 12.5, 10, 1.8),
  nba("Jamal Murray", "DEN", 34, 21, 4, 6, 2.7),
  nba("Jayson Tatum", "BOS", 36, 26, 8.5, 5.5, 3.1),
  nba("Jaylen Brown", "BOS", 34, 24, 5.8, 4.2, 2.2),
  nba("Anthony Edwards", "MIN", 36, 27, 5.6, 4.6, 3.9),
  nba("Julius Randle", "MIN", 33, 19, 7, 4.8, 1.6),
  nba("Luka Doncic", "LAL", 36, 30, 8.2, 8, 3.5),
  nba("LeBron James", "LAL", 34, 23, 7.5, 8.5, 2),
  nba("Victor Wembanyama", "SAS", 33, 25, 11, 3.7, 3.2),
  nba("De'Aaron Fox", "SAS", 34, 22, 4.3, 6.2, 1.9),
  nfl("Patrick Mahomes", "KC", 100, { passYds: 255, passTd: 1.9, passAtt: 36, rushYds: 22 }),
  nfl("Travis Kelce", "KC", 80, { rec: 5.6, recYds: 58 }),
  nfl("Josh Allen", "BUF", 100, { passYds: 245, passTd: 1.8, passAtt: 32, rushYds: 38 }),
  nfl("James Cook", "BUF", 60, { rushYds: 72, rec: 2.4, recYds: 18 }),
  nfl("Jalen Hurts", "PHI", 100, { passYds: 215, passTd: 1.4, passAtt: 29, rushYds: 36 }),
  nfl("Saquon Barkley", "PHI", 75, { rushYds: 98, rec: 2.6, recYds: 20 }),
  nfl("A.J. Brown", "PHI", 85, { rec: 5.2, recYds: 78 }),
  nfl("Jared Goff", "DET", 100, { passYds: 265, passTd: 1.9, passAtt: 34, rushYds: 3 }),
  nfl("Amon-Ra St. Brown", "DET", 90, { rec: 7.4, recYds: 85 }),
  nfl("Jahmyr Gibbs", "DET", 55, { rushYds: 70, rec: 3.2, recYds: 26 }),
];

const MATCHUPS: [string, string][] = [
  ["OKC", "DEN"],
  ["BOS", "MIN"],
  ["LAL", "SAS"],
  ["KC", "BUF"],
  ["PHI", "DET"],
];

export const SAMPLE_DEFENSE: DefenseFactors = {
  OKC: { PTS: 0.93, REB: 1.01, AST: 0.94, "3PM": 0.95, PRA: 0.95 },
  DEN: { PTS: 1.05, REB: 0.98, AST: 1.06, "3PM": 1.08, PRA: 1.04 },
  BOS: { PTS: 0.96, REB: 1.03, AST: 0.97, "3PM": 0.92, PRA: 0.97 },
  MIN: { PTS: 0.95, REB: 0.97, AST: 1.0, "3PM": 1.02, PRA: 0.96 },
  LAL: { PTS: 1.06, REB: 1.07, AST: 1.03, "3PM": 1.04, PRA: 1.06 },
  SAS: { PTS: 1.02, REB: 0.94, AST: 1.04, "3PM": 1.05, PRA: 1.01 },
  KC: { PASS_YDS: 0.94, PASS_TD: 0.9, RUSH_YDS: 1.04, REC: 0.97, REC_YDS: 0.95, RUSH_REC_YDS: 1.0 },
  BUF: { PASS_YDS: 0.97, PASS_TD: 0.95, RUSH_YDS: 1.08, REC: 1.0, REC_YDS: 0.98, RUSH_REC_YDS: 1.05 },
  PHI: { PASS_YDS: 0.9, PASS_TD: 0.88, RUSH_YDS: 0.95, REC: 0.94, REC_YDS: 0.91, RUSH_REC_YDS: 0.93 },
  DET: { PASS_YDS: 1.07, PASS_TD: 1.1, RUSH_YDS: 0.92, REC: 1.05, REC_YDS: 1.08, RUSH_REC_YDS: 0.98 },
};

export const SAMPLE_NEWS: NewsItem[] = [
  {
    id: "n1",
    date: "2026-10-26",
    player: "Jamal Murray",
    team: "DEN",
    kind: "player_questionable",
    headline: "Murray (hamstring) listed questionable vs. OKC",
  },
  {
    id: "n2",
    date: "2026-10-26",
    player: "Jaylen Brown",
    team: "BOS",
    kind: "player_out",
    headline: "Brown (knee) will not play Monday",
  },
  {
    id: "n3",
    date: "2026-10-26",
    player: "Jaylen Brown",
    team: "BOS",
    kind: "teammate_out",
    headline: "Tatum expected to see more touches with Brown out",
    affects: ["Jayson Tatum"],
    usageBoost: 0.07,
  },
  {
    id: "n4",
    date: "2026-10-25",
    player: "LeBron James",
    team: "LAL",
    kind: "minutes_limit",
    headline: "LeBron on a soft minutes cap in second game of back-to-back",
    minutes: 29,
  },
  {
    id: "n5",
    date: "2026-10-26",
    player: "Saquon Barkley",
    team: "PHI",
    kind: "player_questionable",
    headline: "Barkley (ankle) limited in practice, game-time decision",
  },
  {
    id: "n6",
    date: "2026-10-25",
    player: "Brian Branch",
    team: "DET",
    kind: "opponent_out",
    headline: "Lions safety Branch out, secondary thin vs. PHI",
    affects: ["A.J. Brown", "Jalen Hurts"],
    usageBoost: 0.05,
  },
];

// Deterministic PRNG so sample numbers are stable between reloads.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(rand: () => number, mean: number): number {
  // Gamma-Poisson mixture gives realistic overdispersion.
  const shape = 8;
  let g = 0;
  for (let i = 0; i < shape; i++) g -= Math.log(rand());
  const lambda = (mean * g) / shape;
  if (lambda > 30) {
    const u = Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
    return Math.max(0, Math.round(lambda + u * Math.sqrt(lambda)));
  }
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}

const OPPONENTS = ["PHX", "GSW", "MIA", "NYK", "MIL", "DAL", "HOU", "MEM", "SAC", "IND", "CLE", "ORL"];

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function sampleLogs(player: string, games?: number): GameLog[] {
  const p = PROFILES.find((x) => x.player === player);
  if (!p) return [];
  const rand = mulberry32(hash(player));
  const n = games ?? (p.sport === "NFL" ? 12 : 20);
  const daysBetween = p.sport === "NFL" ? 7 : 2;
  const opponents = p.sport === "NFL" ? NFL_OPPONENTS : OPPONENTS;
  const logs: GameLog[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 9, 26));
    d.setUTCDate(d.getUTCDate() - (i + 1) * daysBetween);
    const playing = Math.max(p.sport === "NFL" ? 40 : 18, Math.min(p.sport === "NFL" ? 100 : 48, Math.round(p.playing + (rand() - 0.5) * 10)));
    const scale = playing / p.playing;
    const stats: Record<string, number> = {};
    for (const [field, mean] of Object.entries(p.means)) stats[field] = poisson(rand, mean * scale);
    // Receiving yards scale with receptions; keep them consistent.
    if (stats.rec !== undefined && p.means.rec) stats.recYds = Math.round((stats.recYds + (stats.rec / p.means.rec) * p.means.recYds) / 2);
    logs.push({
      date: d.toISOString().slice(0, 10),
      opponent: opponents[Math.floor(rand() * opponents.length)],
      playing,
      stats,
    });
  }
  return logs;
}

const NFL_OPPONENTS = ["MIA", "NYJ", "NE", "BAL", "CIN", "DAL", "WAS", "GB", "CHI", "MIN", "LAR", "SF"];

const LINES: Record<string, Partial<Record<Prop["stat"], number>>> = {
  "Shai Gilgeous-Alexander": { PTS: 31.5, AST: 6.5, PRA: 42.5 },
  "Jalen Williams": { PTS: 20.5, REB: 5.5 },
  "Nikola Jokic": { PTS: 28.5, REB: 12.5, AST: 9.5, PRA: 50.5 },
  "Jamal Murray": { PTS: 21.5, "3PM": 2.5 },
  "Jayson Tatum": { PTS: 26.5, REB: 8.5, "3PM": 3.5 },
  "Jaylen Brown": { PTS: 23.5 },
  "Anthony Edwards": { PTS: 27.5, "3PM": 3.5 },
  "Julius Randle": { PTS: 18.5, REB: 7.5 },
  "Luka Doncic": { PTS: 30.5, AST: 8.5, PRA: 46.5 },
  "LeBron James": { PTS: 23.5, AST: 8.5 },
  "Victor Wembanyama": { PTS: 24.5, REB: 11.5, "3PM": 2.5 },
  "De'Aaron Fox": { PTS: 21.5, AST: 6.5 },
  "Patrick Mahomes": { PASS_YDS: 254.5, PASS_TD: 1.5, RUSH_YDS: 20.5 },
  "Travis Kelce": { REC: 5.5, REC_YDS: 54.5 },
  "Josh Allen": { PASS_YDS: 239.5, PASS_TD: 1.5, RUSH_YDS: 34.5 },
  "James Cook": { RUSH_YDS: 69.5, RUSH_REC_YDS: 89.5 },
  "Jalen Hurts": { PASS_YDS: 209.5, RUSH_YDS: 34.5 },
  "Saquon Barkley": { RUSH_YDS: 94.5, RUSH_REC_YDS: 114.5 },
  "A.J. Brown": { REC: 4.5, REC_YDS: 71.5 },
  "Jared Goff": { PASS_YDS: 269.5, PASS_TD: 1.5, PASS_ATT: 33.5 },
  "Amon-Ra St. Brown": { REC: 7.5, REC_YDS: 84.5 },
  "Jahmyr Gibbs": { RUSH_YDS: 64.5, RUSH_REC_YDS: 94.5 },
};

export function sampleProps(): Prop[] {
  const props: Prop[] = [];
  for (const p of PROFILES) {
    const game = MATCHUPS.find(([a, b]) => a === p.team || b === p.team)!;
    const opponent = game[0] === p.team ? game[1] : game[0];
    for (const [stat, line] of Object.entries(LINES[p.player] ?? {})) {
      props.push({
        id: `${p.player}-${stat}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        sport: p.sport,
        player: p.player,
        team: p.team,
        opponent,
        stat: stat as Prop["stat"],
        line: line!,
        gameTime: p.sport === "NFL" ? "2026-10-27T00:15:00Z" : "2026-10-26T23:30:00Z",
      });
    }
  }
  return props;
}

export function teamForPlayer(player: string): string | undefined {
  return PROFILES.find((p) => p.player === player)?.team;
}
