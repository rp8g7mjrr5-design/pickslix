// Learning from the whole board, not just the picks we play. Every scan saves each Pick 6 line the model scored
// (the model's own mean, the books' mean and the line), the last version before its game starts. The next morning
// each one is graded from the box score, so the model gets 100+ results a night to learn from instead of the
// handful on a slip. From those it learns two things:
//   - how much to trust the books over its own stats (the blend), per sport, sharp books apart, and
//   - how sure it should be (the tuning in calibration.ts), fit on every graded line.
// Pure: saving and grading are in boardLogData.ts.
import type { GradedPick } from "./accuracy.ts";
import { overUnder } from "./model.ts";
import type { PropWithProjection, Sport, StatKey } from "./types.ts";

export interface BoardEntry {
  sport: Sport;
  player: string;
  team: string;
  opponent: string;
  stat: StatKey;
  line: number;
  gameTime: string;
  /** The model's chance the over hits (pushes left out), before tuning. */
  rawPOver: number;
  /** The stats-only mean, and the mean the books' price implies when they priced it. */
  modelMean?: number;
  marketMean?: number;
  sharp?: boolean;
  /** Variance over mean, to rebuild the chance at any blend. */
  dispersion?: number;
  /** Set once graded: "over", "under", or "push" (pushes and did-not-plays teach nothing). */
  result?: "over" | "under" | "push";
}

export type Board = Record<string, BoardEntry>;

/** Learned weight on the books, per "NBA:books" or "NBA:sharp". */
export interface Blend {
  w: number;
  /** Graded lines behind it. */
  n: number;
}

/** The weights the model uses until it has learned its own. Kept in sync with model.ts. */
export const DEFAULT_BLEND = { books: 0.5, sharp: 0.7 };
/** Graded lines a blend needs before it replaces the default. */
export const MIN_BLEND = 150;

const keyOf = (r: { player: string; stat: StatKey }) => `${r.player.toLowerCase()}|${r.stat}`;
const share = (p: { pOver: number; pUnder: number }) => p.pOver / Math.max(p.pOver + p.pUnder, 1e-9);

/** This scan's lines as board entries: Pick 6's own, healthy, with a real projection. */
export function boardEntries(rows: (PropWithProjection & { pick6?: boolean })[]): BoardEntry[] {
  const out: BoardEntry[] = [];
  for (const r of rows) {
    const p = r.projection;
    if (r.pick6 === false || !r.gameTime || p.status !== "ok" || p.injury === "out") continue;
    const rawPOver = p.rawPOver !== undefined && p.rawPUnder !== undefined ? share({ pOver: p.rawPOver, pUnder: p.rawPUnder }) : undefined;
    if (rawPOver === undefined || !(rawPOver > 0 && rawPOver < 1)) continue;
    out.push({
      sport: r.sport,
      player: r.player,
      team: r.team,
      opponent: r.opponent,
      stat: r.stat,
      line: r.line,
      gameTime: r.gameTime,
      rawPOver: Math.round(rawPOver * 10000) / 10000,
      modelMean: p.modelMean,
      marketMean: p.marketMean,
      sharp: p.marketMean !== undefined ? Boolean(p.market?.sharp) : undefined,
      dispersion: p.dispersion,
    });
  }
  return out;
}

/** Fold a scan into the day's board: lines whose games haven't started take the newest version, started ones stay. */
export function mergeBoard(prev: Board, entries: BoardEntry[], now = Date.now()): Board {
  const next: Board = { ...prev };
  for (const e of entries) {
    const k = keyOf(e);
    const old = next[k];
    if (old && Date.parse(old.gameTime) <= now) continue;
    if (Date.parse(e.gameTime) <= now) continue;
    next[k] = e;
  }
  return next;
}

/** The over share for an entry at blend weight w (on the books), or its saved chance when the books didn't price it. */
export function pOverAt(e: BoardEntry, w: number | undefined): number {
  if (w === undefined || e.marketMean === undefined || e.modelMean === undefined || !e.dispersion) return e.rawPOver;
  const mean = (1 - w) * e.modelMean + w * e.marketMean;
  return share(overUnder(mean, e.dispersion * mean, e.line));
}

const clampP = (p: number) => Math.min(0.98, Math.max(0.02, p));

/**
 * The weight on the books that would have called these lines best (highest log-likelihood), pulled toward the
 * default so a few hundred lines can't swing it to an extreme. Searched in steps of 0.05.
 */
export function fitBlend(entries: BoardEntry[], prior: number): Blend {
  const data = entries.filter((e) => (e.result === "over" || e.result === "under") && e.marketMean !== undefined && e.modelMean !== undefined && e.dispersion);
  let best = prior;
  let bestLl = -Infinity;
  for (let i = 0; i <= 20; i++) {
    const w = i / 20;
    let ll = 0;
    for (const e of data) {
      const p = clampP(pOverAt(e, w));
      ll += Math.log(e.result === "over" ? p : 1 - p);
    }
    // About 200 lines' worth of pull toward the default.
    ll -= 200 * (w - prior) ** 2;
    if (ll > bestLl) {
      bestLl = ll;
      best = w;
    }
  }
  return { w: best, n: data.length };
}

/** A learned blend for every sport with enough graded lines, books and sharp books apart. */
export function fitBlends(entries: BoardEntry[]): Record<string, Blend> {
  const groups = new Map<string, BoardEntry[]>();
  for (const e of entries) {
    if (e.marketMean === undefined) continue;
    const k = `${e.sport}:${e.sharp ? "sharp" : "books"}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const out: Record<string, Blend> = {};
  for (const [k, list] of groups) {
    const fit = fitBlend(list, k.endsWith(":sharp") ? DEFAULT_BLEND.sharp : DEFAULT_BLEND.books);
    if (fit.n >= MIN_BLEND) out[k] = fit;
  }
  return out;
}

/** Graded board lines as picks of the over, at the blend the model will use, for the tuning to fit on. */
export function boardPicks(entries: BoardEntry[], blends: Record<string, Blend> = {}): GradedPick[] {
  const out: GradedPick[] = [];
  for (const e of entries) {
    if (e.result !== "over" && e.result !== "under") continue;
    const w = e.marketMean !== undefined ? blends[`${e.sport}:${e.sharp ? "sharp" : "books"}`]?.w : undefined;
    const p = pOverAt(e, w);
    if (!(p > 0 && p < 1)) continue;
    out.push({ prob: p, rawProb: p, hit: e.result === "over", sport: e.sport, side: "OVER", date: e.gameTime, stat: e.stat });
  }
  return out;
}
