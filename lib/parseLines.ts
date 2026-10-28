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
  /** The side picked, when the text shows exactly one (a screenshot of a saved entry, "Jokic More 27.5 pts"). */
  side?: "OVER" | "UNDER";
}

/** The stat named in a piece of text, if any. */
export function statFromText(text: string): StatKey | undefined {
  return STAT_PATTERNS.find(([re]) => re.test(text))?.[1];
}

const OVER_WORDS = /\b(more|over|higher|o)\b|[↑▲]/i;
const UNDER_WORDS = /\b(less|under|lower|u)\b|[↓▼]/i;

/** Longest phrases first so "Pts + Reb + Ast" isn't read as plain points. */
const STAT_PATTERNS: [RegExp, StatKey][] = [
  [/\b(significant|sig\.?)\s*(strikes?|str)(\s*landed)?\b/i, "SIG_STR"],
  [/\btakedowns?(\s*landed)?\b/i, "TD"],
  // MLB and NHL first: their phrases contain words ("hits", "points") the basketball patterns would grab.
  [/\bh\s*\+\s*r\s*\+\s*rbis?\b|\bhits\s*\+\s*runs\s*\+\s*rbis?\b|\bhrr\b/i, "HRR"],
  [/\btotal\s*bases\b|\btb\b/i, "TB"],
  [/\bhits\s*allowed\b/i, "HITS_ALLOWED"],
  [/\b(pitcher\s*)?strikeouts\b|\bpitcher\s*ks?\b/i, "K"],
  [/\b(pitching\s*)?outs(\s*recorded)?\b/i, "OUTS"],
  [/\brbis?\b/i, "RBI"],
  [/\bruns(\s*scored)?\b/i, "RUNS"],
  [/\bhits\b/i, "HITS"],
  [/\bshots(\s*on\s*goal)?\b|\bsog\b/i, "SOG"],
  [/\b(goalie\s*)?saves\b/i, "SAVES"],
  [/\bgoals\b/i, "GOALS"],
  [/\bhockey\s*points\b/i, "NHL_PTS"],
  [/\bhockey\s*assists\b/i, "NHL_AST"],
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

/** Position tags after a name, plus common OCR misreads of them (SC for SG). */
const POSITION = /^(PG|SG|SF|PF|C|G|F|G-F|F-G|F-C|C-F|QB|RB|WR|TE|K|FB|DST|SC|PC|FC|LW|RW|D|SP|RP|P|1B|2B|3B|SS|LF|CF|RF|OF|DH)$/;

const FILLER = /\b(vs|v|at|more|less|over|under|higher|lower|nba|nfl|nhl|mlb|pick|o|u|projection|line|final|today|tomorrow|mon|tue|wed|thu|fri|sat|sun)\b/gi;

interface Partial {
  player?: string;
  stat?: StatKey;
  line?: number;
  teams: string[];
  /** Sides mentioned; a card showing both More and Less buttons tells us nothing. */
  sides: Set<"OVER" | "UNDER">;
}

function readLine(raw: string): Partial {
  let text = ` ${raw.replace(/[|,;\t]/g, " ")} `;
  const out: Partial = { teams: [], sides: new Set() };

  for (const [re, key] of STAT_PATTERNS) {
    if (re.test(text)) {
      out.stat = key;
      text = text.replace(re, " ");
      break;
    }
  }
  // Game times and dates would otherwise look like the line.
  text = text.replace(/\b\d{1,2}:\d{2}\s*(am|pm)?\b/gi, " ").replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ");
  // "o27.5" / "u27.5" shorthand
  text = text.replace(/\b([ou])(\d)/gi, "$1 $2");
  const n = text.match(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/);
  if (n) {
    out.line = Number(n[1]);
    text = text.replace(n[0], " ");
  }
  if (OVER_WORDS.test(text)) out.sides.add("OVER");
  if (UNDER_WORDS.test(text)) out.sides.add("UNDER");
  text = text.replace(/[@↑↓▲▼]/g, " ").replace(FILLER, " ");

  const words: string[] = [];
  let prevWasName = false;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    // "A. Bailey SF": a position right after a name, even when it spells a team (SF is also the 49ers).
    const isPosition = prevWasName && POSITION.test(w);
    prevWasName = false;
    if (!isPosition && /^[A-Z]{2,5}$/.test(w) && isTeamToken(w)) out.teams.push(w);
    else if (isPosition) continue;
    else if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'’-]*$/.test(w)) {
      words.push(w);
      prevWasName = true;
    }
  }
  // Pick 6 writes "N. Jokic C": drop the position, and lowercase scraps OCR picks up around the name.
  while (words.length && (POSITION.test(words[words.length - 1]) || /^[a-z]{1,3}$/.test(words[words.length - 1]))) words.pop();
  while (words.length && /^[a-z]{1,3}$/.test(words[0])) words.shift();
  // A name is at least two words ("Jokic" alone is too easy to confuse with headers).
  if (words.length >= 2) out.player = words.join(" ");
  return out;
}

const complete = (p: Partial): p is Required<Partial> => Boolean(p.player && p.stat && p.line != null);

export function parseLines(text: string): { lines: ParsedLine[]; skipped: string[] } {
  const lines: ParsedLine[] = [];
  const skipped: string[] = [];
  let cur: Partial = { teams: [], sides: new Set() };
  let curRaw: string[] = [];

  // Lines that only say More/Less (buttons, badges) are held until we know where they belong.
  let sideRun = new Set<"OVER" | "UNDER">();
  let pending: "OVER" | "UNDER" | undefined;

  const flush = () => {
    if (complete(cur)) {
      const side = cur.sides.size === 1 ? [...cur.sides][0] : undefined;
      lines.push({ sport: STATS[cur.stat].sport, player: cur.player, stat: cur.stat, line: cur.line, teams: cur.teams, side });
    } else if (cur.stat) {
      // Only report things that looked like a prop; headers and stray text are dropped quietly.
      skipped.push(curRaw.join(" / "));
    }
    cur = { teams: [], sides: new Set() };
    curRaw = [];
  };

  /** A More and a Less together are unpicked buttons. One alone belongs to this prop, or the next if this one has a side. */
  const settleSides = () => {
    if (sideRun.size === 1) {
      const s = [...sideRun][0];
      if (cur.sides.size) pending = s;
      else cur.sides.add(s);
    }
    sideRun = new Set();
  };

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const got = readLine(raw);
    if (got.sides.size && !got.player && !got.stat && got.line == null && !got.teams.length) {
      got.sides.forEach((x) => sideRun.add(x));
      continue;
    }
    settleSides();
    // A new name means a new prop, once the current one has something besides a name.
    if (got.player && cur.player && (cur.stat || cur.line != null)) flush();
    if (pending && !cur.player) {
      cur.sides.add(pending);
      pending = undefined;
    }
    if (got.player && !cur.player) cur.player = got.player;
    if (got.stat && !cur.stat) cur.stat = got.stat;
    if (got.line != null && cur.line == null) cur.line = got.line;
    cur.teams.push(...got.teams);
    got.sides.forEach((x) => cur.sides.add(x));
    curRaw.push(raw.trim());
  }
  settleSides();
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
