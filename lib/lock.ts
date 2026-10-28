// Daily Lock: a free game. Each day there's a short menu of lines from today's slate; you lock in one side of one
// of them. Hit it and your streak grows, miss and it starts over. Skipping a day doesn't break it, and a push
// leaves it as it was. The model's lean stays hidden until you've locked in. Pure: storage is in lockData.ts.
import { STATS, type PropWithProjection, type Sport, type StatKey } from "./types.ts";

export interface LockOption {
  id: string;
  sport: Sport;
  player: string;
  team: string;
  opponent: string;
  stat: StatKey;
  line: number;
  gameTime: string;
  /** The model's lean, shown once you've locked in. */
  lean: "OVER" | "UNDER";
  leanProb: number;
}

export interface LockMenu {
  /** US Eastern date, YYYYMMDD. */
  date: string;
  options: LockOption[];
}

export interface LockEntry {
  date: string;
  option: LockOption;
  side: "OVER" | "UNDER";
  at: string;
  result?: "hit" | "miss" | "push";
}

export interface LockRecord {
  hits: number;
  misses: number;
  pushes: number;
  /** Straight hits, newest back; a miss ends it. */
  streak: number;
  best: number;
}

export const MENU_SIZE = 5;
/** Streak milestones that earn a badge. */
export const BADGES = [5, 10, 20] as const;
const MIN_GAMES = 8;
/** Lines that are close calls make the game; giveaways don't. */
const MAX_LEAN = 0.68;
const LEAD_MS = 45 * 60_000;

/** Today's menu: close-call lines with a real sample, different players, no more than two per team. */
export function buildMenu(rows: PropWithProjection[], date: string, now = Date.now()): LockMenu | null {
  const ok = rows
    .filter((r) => {
      const p = r.projection;
      const t = Date.parse(r.gameTime ?? "");
      return p.status === "ok" && !p.injury && p.sampleSize >= MIN_GAMES && p.pickProb <= MAX_LEAN && t - now > LEAD_MS && STATS[r.stat].sport !== "UFC";
    })
    // Players people know first: the ones with the biggest lines for their stat tend to be the stars.
    .sort((a, b) => b.projection.sampleSize - a.projection.sampleSize || b.line - a.line);
  const options: LockOption[] = [];
  const players = new Set<string>();
  const teams = new Map<string, number>();
  for (const r of ok) {
    if (options.length >= MENU_SIZE) break;
    if (players.has(r.player) || (teams.get(r.team) ?? 0) >= 2) continue;
    players.add(r.player);
    teams.set(r.team, (teams.get(r.team) ?? 0) + 1);
    options.push({
      id: `${date}-${options.length}`,
      sport: r.sport,
      player: r.player,
      team: r.team,
      opponent: r.opponent,
      stat: r.stat,
      line: r.line,
      gameTime: r.gameTime!,
      lean: r.projection.pick,
      leanProb: Math.round(r.projection.pickProb * 1000) / 1000,
    });
  }
  if (options.length < 3) return null;
  return { date, options: options.sort((a, b) => a.gameTime.localeCompare(b.gameTime)) };
}

/** Can this pick still be made or changed? Not once its game, or the game of the pick it replaces, has started. */
export function canPick(option: LockOption, current: LockEntry | undefined, now = Date.now()): string | null {
  if (Date.parse(option.gameTime) <= now) return "That game has started.";
  if (current && Date.parse(current.option.gameTime) <= now) return "Your lock's game has started, so it's set for today.";
  return null;
}

export function lockRecord(entries: LockEntry[]): LockRecord {
  const graded = entries.filter((e) => e.result).sort((a, b) => a.date.localeCompare(b.date));
  const out: LockRecord = { hits: 0, misses: 0, pushes: 0, streak: 0, best: 0 };
  let run = 0;
  for (const e of graded) {
    if (e.result === "hit") {
      out.hits++;
      run++;
      out.best = Math.max(out.best, run);
    } else if (e.result === "miss") {
      out.misses++;
      run = 0;
    } else out.pushes++;
  }
  out.streak = run;
  return out;
}

/** Badges earned so far (from the best streak ever). */
export const badgesFor = (best: number) => BADGES.filter((b) => best >= b);

/** The next milestone to aim for, if any are left. */
export const nextBadge = (streak: number) => BADGES.find((b) => streak < b);
