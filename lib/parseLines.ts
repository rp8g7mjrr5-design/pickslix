// Turns text copied out of Pick 6 (or typed by hand) into lines. It accepts one line per prop
// ("Nikola Jokic DEN vs GS Points 27.5", "Jokic, PTS, 27.5") and the stacked card layout the app shows,
// where name, matchup, number and stat each sit on their own line.
import { isTeamToken } from "./names.ts";
import { STATS, type Sport, type StatKey } from "./types.ts";

export interface ParsedLine {
  sport: Sport;
  player: string;
  stat: StatKey;
  line: number;
  teams: string[];
}

/** Longest phrases first so "Pts + Reb + Ast" isn't read as plain points. */
const STAT_PATTERNS: [RegExp, StatKey][] = [
  [/\b(pts|points)\s*\+\s*(reb|rebs|rebounds)\s*\+\s*(ast|asts|assists)\b|\bp\s*\+\s*r\s*\+\s*a\b|\bpra\b/i, "PRA"],
  [/\b(pts|points)\s*\+\s*(reb|rebs|rebounds)\b|\bp\s*\+\s*r\b/i, "PR"],
  [/\b(pts|points)\s*\+\s*(ast|asts|assists)\b|\bp\s*\+\s*a\b/i, "PA"],
  [/\b(reb|rebs|rebounds)\s*\+\s*(ast|asts|assists)\b|\br\s*\+\s*a\b/i, "RA"],
  [/\brush(ing)?\s*\+\s*rec(eiving)?(\s*(yds|yards))?\b/i, "RUSH_REC_YDS"],
  [/\bpass(ing)?\s*(yds|yards)\b/i, "PASS_YDS"],
  [/\bpass(ing)?\s*(tds?|touchdowns?)\b/i, "PASS_TD"],
  [/\bpass(ing)?\s*(att|atts|attempts)\b/i, "PASS_ATT"],
  [/\brush(ing)?\s*(yds|yards)\b/i, "RUSH_YDS"],
  [/\brec(eiving)?\s*(yds|yards)\b/i, "REC_YDS"],
  [/\b(receptions|recs?)\b/i, "REC"],
  [/\b3[\s-]*(pt|pts|pointers?|point\s*fg)\s*(made|fgm)?\b|\b3pm\b|\bthrees(\s*made)?\b/i, "3PM"],
  [/\b(rebounds|rebs|reb)\b/i, "REB"],
  [/\b(assists|asts|ast)\b/i, "AST"],
  [/\b(points|pts)\b/i, "PTS"],
];

const FILLER = /\b(vs|v|at|more|less|over|under|higher|lower|nba|nfl|pick|o|u|projection|line|final|today|tomorrow|mon|tue|wed|thu|fri|sat|sun)\b/gi;

interface Partial {
  player?: string;
  stat?: StatKey;
  line?: number;
  teams: string[];
}

function readLine(raw: string): Partial {
  let text = ` ${raw.replace(/[|,;\t]/g, " ")} `;
  const out: Partial = { teams: [] };

  for (const [re, key] of STAT_PATTERNS) {
    if (re.test(text)) {
      out.stat = key;
      text = text.replace(re, " ");
      break;
    }
  }
  // Game times and dates would otherwise look like the line.
  text = text.replace(/\b\d{1,2}:\d{2}\s*(am|pm)?\b/gi, " ").replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ");
  const n = text.match(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/);
  if (n) {
    out.line = Number(n[1]);
    text = text.replace(n[0], " ");
  }
  text = text.replace(/[@]/g, " ").replace(FILLER, " ");

  const words: string[] = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (/^[A-Z]{2,5}$/.test(w) && isTeamToken(w)) out.teams.push(w);
    else if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'’-]*$/.test(w)) words.push(w);
  }
  // A name is at least two words ("Jokic" alone is too easy to confuse with headers).
  if (words.length >= 2) out.player = words.join(" ");
  return out;
}

const complete = (p: Partial): p is Required<Partial> => Boolean(p.player && p.stat && p.line != null);

export function parseLines(text: string): { lines: ParsedLine[]; skipped: string[] } {
  const lines: ParsedLine[] = [];
  const skipped: string[] = [];
  let cur: Partial = { teams: [] };
  let curRaw: string[] = [];

  const flush = () => {
    if (complete(cur)) {
      lines.push({ sport: STATS[cur.stat].sport, player: cur.player, stat: cur.stat, line: cur.line, teams: cur.teams });
    } else if (cur.player || cur.stat || cur.line != null) {
      skipped.push(curRaw.join(" / "));
    }
    cur = { teams: [] };
    curRaw = [];
  };

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const got = readLine(raw);
    // A new name means a new prop, once the current one has something besides a name.
    if (got.player && cur.player && (cur.stat || cur.line != null)) flush();
    if (got.player && !cur.player) cur.player = got.player;
    if (got.stat && !cur.stat) cur.stat = got.stat;
    if (got.line != null && cur.line == null) cur.line = got.line;
    cur.teams.push(...got.teams);
    curRaw.push(raw.trim());
  }
  flush();

  const seen = new Set<string>();
  return {
    lines: lines.filter((l) => {
      const k = `${l.player}|${l.stat}`.toLowerCase();
      return seen.has(k) ? false : (seen.add(k), true);
    }),
    skipped,
  };
}
