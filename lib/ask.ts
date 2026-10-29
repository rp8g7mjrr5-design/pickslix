// Ask LayLock: plain-English questions about a player's line ("Is Tatum's 27.5 safe tonight?"), answered from the
// model's own numbers. No AI service: the question is read for a player, a stat, a number and a side, and the
// answer is written from the projection. Pure: lookups are in app/api/ask.
import { normName } from "./names.ts";
import { statFromText } from "./parseLines.ts";
import { STATS, type PropWithProjection, type StatKey } from "./types.ts";

export interface Question {
  /** Words that could be part of a name, in order. */
  name: string;
  stat?: StatKey;
  line?: number;
  side?: "OVER" | "UNDER";
}

const STOP = new Set(
  `is are was will would should could can do does did i im i'm me my we you your the a an his her their this that these those to of on in at for and or but with
  safe lock locks good bad bet play take taking think like love hate tonight today tomorrow game games line lines prop props pick picks
  what whats what's how hows how's about any chance odds go goes going get gets hit hits clear clears smash value worth it its it's tell
  more less over under higher lower than o u yes no ok okay please hey yo vs versus against`.split(/\s+/),
);

export function readQuestion(q: string): Question {
  const text = q.replace(/[’]/g, "'");
  const stat = statFromText(text);
  const num = text.match(/(?:^|[^\w.])(\d+(?:\.\d+)?)(?![\w.])/);
  const side = /\b(more|over|higher|o\d)/i.test(text) ? "OVER" : /\b(less|under|lower|u\d)/i.test(text) ? "UNDER" : undefined;
  // Take out the stat phrase and the number, then keep name-like words.
  let rest = text;
  if (stat) {
    // Remove the words that named the stat ("points", "rebounds", "pass yards").
    for (const w of STATS[stat].label.toLowerCase().split(/\s+/)) rest = rest.replace(new RegExp(`\\b${w}s?\\b`, "ig"), " ");
    rest = rest.replace(/\b(pts|reb|rebs|ast|asts|pra|yds|yards|sog|tds?|ks?|3pm|threes|pass(ing)?|rush(ing)?|rec(eiving)?|shots?|total|bases)\b/gi, " ");
  }
  const name = rest
    .replace(/'s\b/gi, " ")
    .replace(/[^A-Za-zÀ-ÿ.'\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w.toLowerCase()))
    .join(" ");
  return { name, stat, line: num ? Number(num[1]) : undefined, side };
}

/** Rows for the player the question names: a full-name match first, then a last-name one. */
export function matchPlayer<R extends { player: string }>(name: string, rows: R[]): R[] {
  const q = normName(name);
  if (!q) return [];
  const words = new Set(q.split(" "));
  const full = rows.filter((r) => q.includes(normName(r.player)));
  if (full.length) return full;
  return rows.filter((r) => {
    const parts = normName(r.player).split(" ");
    return words.has(parts[parts.length - 1]) && parts[parts.length - 1].length > 2;
  });
}

const sideWord = (s: "OVER" | "UNDER") => (s === "OVER" ? "More" : "Less");
const pc = (p: number) => `${Math.round(p * 100)}%`;
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export interface Answer {
  headline: string;
  lines: string[];
  side: "OVER" | "UNDER";
  prob: number;
}

/** The answer for one scored line. `asked` is the side the question leaned on, if any. */
export function answerFor(row: PropWithProjection, asked?: "OVER" | "UNDER"): Answer {
  const p = row.projection;
  const label = STATS[row.stat].label.toLowerCase();
  const side = asked ?? p.pick;
  const prob = side === "OVER" ? p.pOver : p.pUnder;
  const lines: string[] = [];
  const last = row.player.trim().split(/\s+/).slice(-1)[0];
  let headline: string;
  if (p.status === "out") {
    headline = `${row.player} is listed out, so this pick will likely be voided.`;
  } else if (Math.abs(p.pOver - p.pUnder) < 0.06) {
    headline = `It's close to a coin flip: More ${pc(p.pOver)}, Less ${pc(p.pUnder)}.`;
  } else if (asked && asked !== p.pick) {
    headline = `The model would go the other way: ${sideWord(p.pick)} ${pc(p.pickProb)}, ${sideWord(asked)} only ${pc(prob)}.`;
  } else if (prob >= 0.66) {
    headline = `${sideWord(side)} ${fmt(row.line)} is one of the stronger looks: the model has it at ${pc(prob)}.`;
  } else {
    headline = `Lean ${sideWord(side)}: the model has it at ${pc(prob)}. Good, not a lock.`;
  }
  lines.push(`It expects about ${fmt(Math.round(p.mean * 10) / 10)} ${label} against a line of ${fmt(row.line)}.`);
  if (row.recent.length) {
    const over = row.recent.filter((v) => v > row.line).length;
    lines.push(`${last} has gone over ${fmt(row.line)} in ${over} of the last ${row.recent.length}.`);
  }
  if (p.marketProb !== undefined) {
    const agree = p.marketProb >= 0.5;
    lines.push(agree ? `The sportsbooks agree, pricing ${sideWord(p.pick)} at ${pc(p.marketProb)}.` : `The sportsbooks lean the other way (${sideWord(p.pick)} only ${pc(p.marketProb)}).`);
  }
  const why = p.reasons.filter((r) => !/^Hit the (over|under) in/.test(r)).slice(0, 2);
  if (why.length) lines.push(`Why: ${why.join(". ")}.`);
  if (p.injury === "questionable") lines.push(`${last} is questionable, so check the injury news before lock.`);
  if (p.confidence === "low") lines.push(`Small sample (${p.sampleSize} games), so treat this as rough.`);
  return { headline, lines, side, prob };
}

/** When the question names a player but not a line: their lines tonight. */
export function listFor(rows: PropWithProjection[]): string {
  const top = [...rows].sort((a, b) => b.projection.pickProb - a.projection.pickProb).slice(0, 4);
  return `Tonight's lines for ${rows[0].player}: ${top.map((r) => `${STATS[r.stat].label} ${fmt(r.line)} (${sideWord(r.projection.pick)} ${pc(r.projection.pickProb)})`).join(", ")}.`;
}
