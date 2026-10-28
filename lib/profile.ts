// The numbers on someone's profile, from their own saved slips. Unlike the leaderboard this counts every graded
// pick, marked by hand or not, since it's their own record; the leaderboard's stricter count is shown beside it.
import type { SavedSlip, SlipLeg } from "./storage.ts";
import { STATS, type Sport, type StatKey } from "./types.ts";

export interface Split {
  n: number;
  hits: number;
  /** Average chance the model gave these picks. */
  expected: number;
}

export interface ProfileStats {
  picks: number;
  hits: number;
  hitRate: number;
  /** What the model expected them to hit, for "beating the model" or not. */
  expected: number;
  slips: { settled: number; won: number; open: number };
  /** Profit over amount staked on settled slips; null before any settle. */
  roi: number | null;
  profit: number;
  streak: { current: number; kind: "hit" | "miss" | null; best: number };
  /** Last 10 graded picks, oldest first, for a form strip. */
  form: ("hit" | "miss")[];
  bySport: (Split & { sport: Sport })[];
  byStat: (Split & { stat: StatKey })[];
  overs: Split;
  unders: Split;
  /** The pick they hit that the model liked least. */
  bestCall?: { player: string; stat: StatKey; line: number; side: "OVER" | "UNDER"; prob: number };
}

const empty = (): Split => ({ n: 0, hits: 0, expected: 0 });

function add(s: Split, l: SlipLeg) {
  s.expected = (s.expected * s.n + l.prob) / (s.n + 1);
  s.n++;
  if (l.result === "hit") s.hits++;
}

const when = (s: SavedSlip, l: SlipLeg) => Date.parse(l.gameTime ?? s.createdAt) || 0;

export function profileStats(slips: SavedSlip[]): ProfileStats {
  const legs = slips
    .flatMap((s) => (Array.isArray(s?.legs) ? s.legs.map((l) => ({ l, t: when(s, l) })) : []))
    .filter(({ l }) => l.result === "hit" || l.result === "miss")
    .sort((a, b) => a.t - b.t)
    .map(({ l }) => l);

  const sports = new Map<Sport, Split>();
  const stats = new Map<StatKey, Split>();
  const overs = empty();
  const unders = empty();
  let best = 0;
  let run = 0;
  let kind: "hit" | "miss" | null = null;
  let bestCall: ProfileStats["bestCall"];
  for (const l of legs) {
    const sport = l.sport ?? STATS[l.stat]?.sport;
    if (sport) add(sports.get(sport) ?? (sports.set(sport, empty()), sports.get(sport)!), l);
    if (l.stat in STATS) add(stats.get(l.stat) ?? (stats.set(l.stat, empty()), stats.get(l.stat)!), l);
    add(l.side === "OVER" ? overs : unders, l);
    run = l.result === kind ? run + 1 : 1;
    kind = l.result as "hit" | "miss";
    if (kind === "hit") best = Math.max(best, run);
    if (l.result === "hit" && l.prob > 0 && (!bestCall || l.prob < bestCall.prob))
      bestCall = { player: l.player, stat: l.stat, line: l.line, side: l.side, prob: l.prob };
  }

  let settled = 0;
  let won = 0;
  let open = 0;
  let staked = 0;
  let profit = 0;
  for (const s of slips) {
    if (!Array.isArray(s?.legs) || !s.legs.length) continue;
    if (!s.legs.every((l) => l.result)) {
      open++;
      continue;
    }
    const live = s.legs.filter((l) => l.result !== "push");
    const win = live.length >= 2 && live.every((l) => l.result === "hit");
    const entry = Number(s.entry) || 0;
    settled++;
    if (win) won++;
    staked += entry;
    profit += win ? entry * (Number(s.multiplier) || 0) - entry : -entry;
  }

  const hits = legs.filter((l) => l.result === "hit").length;
  const bySize = <K extends string>(m: Map<K, Split>, key: "sport" | "stat") =>
    [...m.entries()].map(([k, v]) => ({ ...v, [key]: k })).sort((a, b) => b.n - a.n);
  return {
    picks: legs.length,
    hits,
    hitRate: legs.length ? hits / legs.length : 0,
    expected: legs.length ? legs.reduce((a, l) => a + l.prob, 0) / legs.length : 0,
    slips: { settled, won, open },
    roi: staked ? profit / staked : null,
    profit,
    streak: { current: kind ? run : 0, kind, best },
    form: legs.slice(-10).map((l) => l.result as "hit" | "miss"),
    bySport: bySize(sports, "sport") as ProfileStats["bySport"],
    byStat: bySize(stats, "stat") as ProfileStats["byStat"],
    overs,
    unders,
    bestCall,
  };
}

/** A starting username from a Clerk profile: "Jacob Smith" or "jacob.smith@x.com" → "jacob_smith". */
export function suggestUsername(first?: string | null, last?: string | null, email?: string | null): string {
  const base = [first, last].filter(Boolean).join("_") || (email ?? "").split("@")[0];
  const clean = base
    .normalize("NFKD")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toLowerCase()
    .slice(0, 20);
  return clean.length >= 3 ? clean : "";
}
