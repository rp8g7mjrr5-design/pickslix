// NFL depth from nflverse (free, public CSVs on GitHub, updated through the season): each player's snap,
// target and carry share and how they're trending, each defense's EPA allowed per dropback and per carry, and
// what each defense allows to WRs, TEs and RBs. That's what lets the model see a role change before the box
// scores average it in, and a matchup down to the position instead of the whole team.
import { canonTeam, normName } from "./names.ts";
import type { Prop, StatKey } from "./types.ts";

/** Games counted as "recent" for share trends. */
const RECENT = 3;
/** A defense's numbers are shrunk toward league average as if it had this many more average games. */
const PRIOR_GAMES = 3;

type PosGroup = "WR" | "TE" | "RB";
const GROUPS: PosGroup[] = ["WR", "TE", "RB"];
const OFFENSE = new Set(["QB", "RB", "FB", "WR", "TE"]);

export interface NflPlayer {
  team: string;
  pos: string;
  games: number;
  snapRecent?: number;
  snapSeason?: number;
  tgtRecent?: number;
  tgtSeason?: number;
  carryRecent?: number;
  carrySeason?: number;
}

export interface NflDefense {
  games: number;
  /** EPA allowed per dropback and per carry, shrunk toward league average. */
  passEpa: number;
  rushEpa: number;
  /** Receiving yards and catches allowed per game to each position group, vs league average (1.1 = 10% more). */
  recYds: Partial<Record<PosGroup, number>>;
  rec: Partial<Record<PosGroup, number>>;
}

export interface NflContext {
  season: number;
  updatedAt: string;
  players: Record<string, NflPlayer>;
  defense: Record<string, NflDefense>;
  league: { passEpa: number; rushEpa: number };
}

/** Split CSV text into rows of fields, honoring quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0]) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries((head ?? []).map((h, i) => [h, r[i] ?? ""])));
}

const n = (v: string | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const group = (pos: string): PosGroup | undefined => (GROUPS.includes(pos as PosGroup) ? (pos as PosGroup) : pos === "FB" ? "RB" : undefined);
const round = (x: number | undefined, d = 3) => (x === undefined ? undefined : Math.round(x * 10 ** d) / 10 ** d);

/** Build the context from nflverse's weekly player stats and snap counts for one season. */
export function buildNflContext(weekRows: Record<string, string>[], snapRows: Record<string, string>[], season: number): NflContext {
  const games = weekRows.filter((r) => r.season_type === "REG" || r.season_type === "POST");

  // Team carries per game, for carry share.
  const teamCarries = new Map<string, number>();
  for (const r of games) {
    const k = `${r.game_id}|${canonTeam(r.team, "NFL")}`;
    teamCarries.set(k, (teamCarries.get(k) ?? 0) + n(r.carries));
  }

  // Per player, newest week first.
  const byPlayer = new Map<string, { team: string; pos: string; weeks: { week: number; game: string; tgt: number; carry?: number }[] }>();
  for (const r of games) {
    const key = normName(r.player_display_name || r.player_name);
    // Offense only: there's a Josh Allen on defense too.
    if (!key || !OFFENSE.has(r.position)) continue;
    const team = canonTeam(r.team, "NFL");
    const tc = teamCarries.get(`${r.game_id}|${team}`) ?? 0;
    const p = byPlayer.get(key) ?? { team, pos: r.position, weeks: [] };
    p.team = team;
    p.weeks.push({ week: n(r.week), game: r.game_id, tgt: n(r.target_share), carry: tc ? n(r.carries) / tc : undefined });
    byPlayer.set(key, p);
  }
  const snaps = new Map<string, { week: number; pct: number }[]>();
  for (const r of snapRows) {
    if (r.game_type && r.game_type !== "REG" && r.game_type !== "POST") continue;
    const pct = n(r.offense_pct);
    if (!pct) continue;
    const key = normName(r.player);
    snaps.set(key, [...(snaps.get(key) ?? []), { week: n(r.week), pct }]);
  }

  const players: Record<string, NflPlayer> = {};
  for (const [key, p] of byPlayer) {
    const weeks = p.weeks.sort((a, b) => b.week - a.week);
    const sn = (snaps.get(key) ?? []).sort((a, b) => b.week - a.week);
    const tg = weeks.map((w) => w.tgt);
    const ca = weeks.map((w) => w.carry).filter((x): x is number => x !== undefined);
    players[key] = {
      team: p.team,
      pos: p.pos,
      games: weeks.length,
      snapRecent: round(avg(sn.slice(0, RECENT).map((s) => s.pct))),
      snapSeason: round(avg(sn.map((s) => s.pct))),
      tgtRecent: round(avg(tg.slice(0, RECENT))),
      tgtSeason: round(avg(tg)),
      carryRecent: round(avg(ca.slice(0, RECENT))),
      carrySeason: round(avg(ca)),
    };
  }

  // Defense: everything opponents did against each team.
  const d = new Map<string, { games: Set<string>; passEpa: number; dropbacks: number; rushEpa: number; carries: number; recYds: Record<PosGroup, number>; rec: Record<PosGroup, number> }>();
  for (const r of games) {
    const opp = canonTeam(r.opponent_team, "NFL");
    if (!opp) continue;
    const e = d.get(opp) ?? { games: new Set(), passEpa: 0, dropbacks: 0, rushEpa: 0, carries: 0, recYds: { WR: 0, TE: 0, RB: 0 }, rec: { WR: 0, TE: 0, RB: 0 } };
    e.games.add(r.game_id);
    e.passEpa += n(r.passing_epa);
    e.dropbacks += n(r.attempts) + n(r.sacks_suffered);
    e.rushEpa += n(r.rushing_epa);
    e.carries += n(r.carries);
    const g = group(r.position);
    if (g) {
      e.recYds[g] += n(r.receiving_yards);
      e.rec[g] += n(r.receptions);
    }
    d.set(opp, e);
  }
  const all = [...d.values()];
  const totalDrop = all.reduce((a, e) => a + e.dropbacks, 0);
  const totalCarry = all.reduce((a, e) => a + e.carries, 0);
  const totalGames = all.reduce((a, e) => a + e.games.size, 0);
  const league = {
    passEpa: totalDrop ? all.reduce((a, e) => a + e.passEpa, 0) / totalDrop : 0,
    rushEpa: totalCarry ? all.reduce((a, e) => a + e.rushEpa, 0) / totalCarry : 0,
  };
  const perGame = (f: (e: (typeof all)[number]) => number) => (totalGames ? all.reduce((a, e) => a + f(e), 0) / totalGames : 0);
  const defense: Record<string, NflDefense> = {};
  for (const [team, e] of d) {
    const g = e.games.size;
    const w = g / (g + PRIOR_GAMES);
    const shrink = (v: number, lg: number) => lg + (v - lg) * w;
    const recYds: Partial<Record<PosGroup, number>> = {};
    const rec: Partial<Record<PosGroup, number>> = {};
    for (const pg of GROUPS) {
      const lgY = perGame((x) => x.recYds[pg]);
      const lgR = perGame((x) => x.rec[pg]);
      if (lgY) recYds[pg] = round(shrink(e.recYds[pg] / g / lgY, 1));
      if (lgR) rec[pg] = round(shrink(e.rec[pg] / g / lgR, 1));
    }
    defense[team] = {
      games: g,
      passEpa: round(shrink(e.dropbacks ? e.passEpa / e.dropbacks : league.passEpa, league.passEpa))!,
      rushEpa: round(shrink(e.carries ? e.rushEpa / e.carries : league.rushEpa, league.rushEpa))!,
      recYds,
      rec,
    };
  }
  return { season, updatedAt: new Date().toISOString(), players, defense, league: { passEpa: round(league.passEpa)!, rushEpa: round(league.rushEpa)! } };
}

/** NFL season a date falls in: September through February belong to the year it started. */
export const nflSeason = (d = new Date()) => (d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1);

/** The slice of the context one prop needs, small enough to send to the browser. */
export interface NflSlice {
  player?: NflPlayer;
  defense?: NflDefense;
  league: { passEpa: number; rushEpa: number };
  /** Opponent's rank (1 = allows the most) for EPA per dropback and per carry. */
  passRank?: number;
  rushRank?: number;
}

export function nflSlice(ctx: NflContext, player: string, opponent: string): NflSlice {
  const teams = Object.entries(ctx.defense);
  const rankOf = (f: (d: NflDefense) => number) => {
    const sorted = teams.sort((a, b) => f(b[1]) - f(a[1])).map(([t]) => t);
    const i = sorted.indexOf(opponent);
    return i >= 0 ? i + 1 : undefined;
  };
  return {
    player: ctx.players[normName(player)],
    defense: ctx.defense[opponent],
    league: ctx.league,
    passRank: rankOf((d) => d.passEpa),
    rushRank: rankOf((d) => d.rushEpa),
  };
}

const RECEIVING: StatKey[] = ["REC", "REC_YDS"];
const PASSING: StatKey[] = ["PASS_YDS", "PASS_TD", "PASS_ATT"];
/** How much of a share trend carries into the projection (recent form is already weighted in the game logs). */
const TREND_WEIGHT = 0.4;
const pctTxt = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
const ord = (k: number) => `${k}${k % 10 === 1 && k !== 11 ? "st" : k % 10 === 2 && k !== 12 ? "nd" : k % 10 === 3 && k !== 13 ? "rd" : "th"}`;

export interface Adjustment {
  factor: number;
  reasons: string[];
  /** The position-level matchup replaces the team-level defense factor for this stat. */
  replacesDefense?: boolean;
}

/** What the nflverse context changes for one NFL prop. */
export function nflAdjust(prop: Prop, s: NflSlice): Adjustment {
  let factor = 1;
  const reasons: string[] = [];
  let replacesDefense = false;
  const p = s.player;

  // Role trend: target share for catches and receiving yards, carry share for rushing.
  const trend = (recent?: number, season?: number, label = "") => {
    if (!p || recent === undefined || !season || season < 0.05 || p.games < RECENT + 2) return;
    const ratio = Math.max(0.7, Math.min(1.3, recent / season));
    const f = 1 + (ratio - 1) * TREND_WEIGHT;
    if (Math.abs(f - 1) < 0.02) return;
    factor *= f;
    reasons.push(`${label} ${pctTxt(recent)} over the last ${RECENT} games vs ${pctTxt(season)} on the season: ${signed(f - 1)}`);
  };
  if (RECEIVING.includes(prop.stat) || prop.stat === "RUSH_REC_YDS") trend(p?.tgtRecent, p?.tgtSeason, "Target share");
  if (prop.stat === "RUSH_YDS" || prop.stat === "RUSH_REC_YDS") trend(p?.carryRecent, p?.carrySeason, "Carry share");
  if (p?.snapRecent !== undefined && p.snapSeason && Math.abs(p.snapRecent - p.snapSeason) >= 0.1 && prop.stat !== "PASS_YDS") {
    reasons.push(`Snap share ${pctTxt(p.snapRecent)} lately vs ${pctTxt(p.snapSeason)} on the season`);
  }

  // Matchup by position: what this defense allows to WRs, TEs or RBs, not just through the air overall.
  const g = p ? group(p.pos) : undefined;
  const pos = g && s.defense ? (prop.stat === "REC" ? s.defense.rec[g] : prop.stat === "REC_YDS" ? s.defense.recYds[g] : undefined) : undefined;
  if (pos && g) {
    const f = 1 + (pos - 1) * 0.6;
    factor *= f;
    replacesDefense = true;
    reasons.push(`${prop.opponent} allows ${signed(pos - 1)} ${prop.stat === "REC" ? "catches" : "receiving yards"} to ${g}s vs league average`);
  }

  // EPA allowed: fills the passing-TD gap, and gives the QB-level matchup context.
  if (s.defense && PASSING.includes(prop.stat)) {
    const gap = s.defense.passEpa - s.league.passEpa;
    if (prop.stat === "PASS_TD") {
      const f = 1 + Math.max(-0.12, Math.min(0.12, gap * 1.2));
      factor *= f;
      replacesDefense = true;
      reasons.push(`${prop.opponent} allows ${s.defense.passEpa >= 0 ? "+" : ""}${s.defense.passEpa.toFixed(2)} EPA per dropback (${ord(s.passRank ?? 0)}-most): ${signed(f - 1)}`);
    } else if (s.passRank) {
      reasons.push(`${prop.opponent} pass defense: ${s.defense.passEpa >= 0 ? "+" : ""}${s.defense.passEpa.toFixed(2)} EPA per dropback allowed, ${ord(s.passRank)}-most in the league`);
    }
  }
  if (s.defense && prop.stat === "RUSH_YDS" && s.rushRank) {
    reasons.push(`${prop.opponent} run defense: ${s.defense.rushEpa >= 0 ? "+" : ""}${s.defense.rushEpa.toFixed(2)} EPA per carry allowed, ${ord(s.rushRank)}-most in the league`);
  }
  return { factor: Math.max(0.8, Math.min(1.2, factor)), reasons, replacesDefense };
}
