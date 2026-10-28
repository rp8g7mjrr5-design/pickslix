// Pick of the day: the one line on today's slate the model likes most, chosen once a day and graded in public so
// its record is there for anyone to check. Pure: loading and saving are in potdData.ts.
import { STATS, type PropWithProjection, type Sport, type StatKey } from "./types.ts";

export interface Potd {
  /** US Eastern date the pick is for, YYYYMMDD. */
  date: string;
  sport: Sport;
  player: string;
  team: string;
  opponent: string;
  stat: StatKey;
  line: number;
  side: "OVER" | "UNDER";
  prob: number;
  gameTime: string;
  /** The model's top reasons, for the card. */
  reasons: string[];
  /** The books' chance for the same side, when they priced it. */
  marketProb?: number;
  result?: "hit" | "miss" | "push";
}

/** Too thin a sample, or a game this close to starting, and it isn't the pick. */
const MIN_GAMES = 8;
const LEAD_MS = 20 * 60_000;

/** The best line on the board: a real sample, no injury flag, and the books not leaning the other way. */
export function choosePick(rows: PropWithProjection[], date: string, now = Date.now()): Potd | null {
  const ok = rows.filter((r) => {
    const p = r.projection;
    const t = Date.parse(r.gameTime ?? "");
    if (p.status !== "ok" || p.injury || p.confidence === "low" || p.sampleSize < MIN_GAMES) return false;
    if (!(t - now > LEAD_MS) || STATS[r.stat].sport === "UFC") return false;
    return p.marketProb === undefined || p.marketProb >= 0.5;
  });
  // Rank by the model's chance, nudged toward picks the books agree with.
  const score = (r: PropWithProjection) => r.projection.pickProb + (r.projection.marketProb !== undefined ? 0.02 : 0);
  const best = ok.sort((a, b) => score(b) - score(a))[0];
  if (!best) return null;
  return {
    date,
    sport: best.sport,
    player: best.player,
    team: best.team,
    opponent: best.opponent,
    stat: best.stat,
    line: best.line,
    side: best.projection.pick,
    prob: Math.round(best.projection.pickProb * 1000) / 1000,
    gameTime: best.gameTime!,
    reasons: best.projection.reasons.slice(0, 2),
    marketProb: best.projection.marketProb,
  };
}

export interface PotdRecord {
  hits: number;
  misses: number;
  pushes: number;
  /** Current run, newest first: 3 means three straight hits, -2 two straight misses. */
  streak: number;
}

/** Record from graded picks, newest first. */
export function potdRecord(history: Potd[]): PotdRecord {
  const graded = history.filter((p) => p.result).sort((a, b) => b.date.localeCompare(a.date));
  const out: PotdRecord = { hits: 0, misses: 0, pushes: 0, streak: 0 };
  for (const p of graded) {
    if (p.result === "hit") out.hits++;
    else if (p.result === "miss") out.misses++;
    else out.pushes++;
  }
  for (const p of graded) {
    if (p.result === "push") continue;
    const s = p.result === "hit" ? 1 : -1;
    if (out.streak && Math.sign(out.streak) !== s) break;
    out.streak += s;
  }
  return out;
}
