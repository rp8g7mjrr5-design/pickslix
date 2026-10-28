// Where Pick 6 is behind. Two scans over today's scored slate:
// - Soft lines: Pick 6 posts a line and moves it slowly, while the sportsbooks move fast. When the books' price,
//   restated at the Pick 6 line, clearly favors one side, that line is soft.
// - Injury ripples: a starter is ruled out, the model bumps his teammates for the extra usage, and Pick 6's line
//   for them hasn't moved yet.
// Pure: the slate is loaded in slateData.ts.
import { sideChance } from "./clv.ts";
import type { SlateRow } from "./slateData.ts";
import { STATS, type Sport, type StatKey } from "./types.ts";

export interface Edge {
  kind: "soft" | "ripple";
  /** Stable id, so an alert for the same edge goes out once. */
  id: string;
  sport: Sport;
  player: string;
  team: string;
  opponent: string;
  stat: StatKey;
  line: number;
  side: "OVER" | "UNDER";
  gameTime: string;
  /** The model's chance for `side`. */
  prob: number;
  /** soft: the books' chance for `side` at the Pick 6 line, and the line they're dealing. */
  booksProb?: number;
  booksLine?: number;
  /** ripple: who is out, and the bump the model gave. */
  outPlayer?: string;
  boost?: number;
}

/** The books' chance for one side has to be at least this at the Pick 6 line. */
export const SOFT_MIN = 0.57;
/** A ripple has to leave the model this sure of the over. */
export const RIPPLE_MIN = 0.58;
/** Too close to the start and there's no time to act. */
const LEAD_MS = 10 * 60_000;

const upcoming = (r: SlateRow, now: number) => Date.parse(r.gameTime ?? "") - now > LEAD_MS && r.projection.status === "ok" && !r.projection.injury;

const day = (iso: string) => iso.slice(0, 10);

export function softLines(rows: SlateRow[], now = Date.now()): Edge[] {
  const out: Edge[] = [];
  for (const r of rows) {
    const p = r.projection;
    if (!r.pick6 || !p.market || !upcoming(r, now)) continue;
    const d = p.dispersion && p.dispersion > 0 ? p.dispersion : 1.2;
    const over = sideChance(p.market, r.line, "OVER", d);
    const side = over >= 0.5 ? "OVER" : "UNDER";
    const booksProb = side === "OVER" ? over : 1 - over;
    if (booksProb < SOFT_MIN) continue;
    out.push({
      kind: "soft",
      id: `soft:${r.id}:${r.line}:${side}:${day(r.gameTime!)}`,
      sport: r.sport,
      player: r.player,
      team: r.team,
      opponent: r.opponent,
      stat: r.stat,
      line: r.line,
      side,
      gameTime: r.gameTime!,
      prob: side === "OVER" ? p.pOver : p.pUnder,
      booksProb,
      booksLine: p.market.line,
    });
  }
  return out.sort((a, b) => b.booksProb! - a.booksProb!);
}

/** "Ja Morant is out: +12% (…)" from the usage model, or "Ja Morant out, usage bump 12%: …" from the news feed. */
const OUT_REASON = /^(.+?)(?: is out: \+(\d+)%| out, usage bump (\d+)%)/;

export function rippleLines(rows: SlateRow[], now = Date.now()): Edge[] {
  const out: Edge[] = [];
  for (const r of rows) {
    const p = r.projection;
    // A line that already moved means Pick 6 has caught up.
    if (r.open !== undefined || p.pick !== "OVER" || p.pickProb < RIPPLE_MIN || !upcoming(r, now)) continue;
    const m = p.reasons.map((x) => OUT_REASON.exec(x)).find(Boolean);
    if (!m) continue;
    const boost = Number(m[2] ?? m[3]) / 100;
    if (!(boost >= 0.04)) continue;
    out.push({
      kind: "ripple",
      id: `ripple:${r.id}:${r.line}:${day(r.gameTime!)}`,
      sport: r.sport,
      player: r.player,
      team: r.team,
      opponent: r.opponent,
      stat: r.stat,
      line: r.line,
      side: "OVER",
      gameTime: r.gameTime!,
      prob: p.pickProb,
      outPlayer: m[1],
      boost,
    });
  }
  return out.sort((a, b) => b.prob - a.prob);
}

const what = (e: Edge) => `${e.player} ${e.side === "OVER" ? "More" : "Less"} than ${e.line} ${STATS[e.stat].label.toLowerCase()}`;
const pc = (x: number) => `${Math.round(x * 100)}%`;

/** The phone alert for an edge. */
export function edgeAlert(e: Edge): { id: string; title: string; body: string; url: string } {
  if (e.kind === "soft")
    return {
      id: e.id,
      title: `Soft line: ${e.player}`,
      body:
        e.booksLine !== undefined && e.booksLine !== e.line
          ? `Pick 6 has ${e.line} ${STATS[e.stat].label.toLowerCase()}, books are at ${e.booksLine}. ${e.side === "OVER" ? "More" : "Less"} is ${pc(e.booksProb!)} by the books.`
          : `Books give ${what(e)} ${pc(e.booksProb!)} and Pick 6 hasn't adjusted.`,
      url: "/#edges",
    };
  return {
    id: e.id,
    title: `${e.outPlayer} is out`,
    body: `${e.player}'s ${STATS[e.stat].label.toLowerCase()} line (${e.line}) hasn't moved. The model now has More at ${pc(e.prob)}.`,
    url: "/#edges",
  };
}
