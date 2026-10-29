// Sportsbook markets: moneylines, spreads and totals for every game, and player props bet straight.
// The fair price of each side comes from the books themselves with their margin taken out (Pinnacle and BetOnline,
// the sharpest books the API carries, count double), and is then compared with the best price any book is
// dealing. A side whose best price beats its fair chance is +EV: shopping lines is the one edge every bettor has.
// Player props use the model's own chance instead, at the line the books deal.
// Pure, except fetchGameMarkets.
import { kvGet, kvSet } from "./db.ts";
import { overUnder } from "./model.ts";
import { BOOK_NAMES, PRICED_BOOKS, SHARP_BOOKS, SPORT_KEYS, canSpend, impliedProb, oddsEnabled, oddsJson, parseSlate, type BestPrice, type Slate } from "./odds.ts";
import { blend, predict, sideChance, type Ratings } from "./ratings.ts";
import { STATS, type PropWithProjection, type Sport, type StatKey } from "./types.ts";

export type MarketKey = "h2h" | "spreads" | "totals";
export const MARKET_LABEL: Record<MarketKey, string> = { h2h: "Moneyline", spreads: "Spread", totals: "Total" };

/** One side of a game market: a team (moneyline, spread) or Over/Under (total). */
export interface SideQuote {
  name: string;
  /** Spread or total points, when the market has them. */
  point?: number;
  /** No-vig chance from the books' consensus. */
  fair: number;
  /** American odds that fair chance is worth. */
  fairPrice: number;
  best: BestPrice;
  /** Expected profit per unit staked at the best price, at the fair chance. */
  ev: number;
  /** LayLock's team-ratings chance (lib/ratings.ts), when both teams are rated. */
  model?: number;
  /** The fair chance nudged toward the model's: what LayLock thinks, and the EV at the best price on it. */
  chance?: number;
  modelEv?: number;
}

export interface MarketView {
  key: MarketKey;
  sides: SideQuote[];
  /** Books that priced every side at the consensus point. */
  books: number;
  sharp: boolean;
}

export interface GameBoard {
  id: string;
  sport: Sport;
  home: string;
  away: string;
  start: string;
  markets: MarketView[];
  /** The ratings model's expected score, when both teams are rated. */
  projected?: { home: number; away: number };
}

/** Below this many books a "best price" is just one book's number; don't call it an edge. */
export const MIN_BOOKS = 3;
/** EV at least this big is flagged. Smaller gaps are within the noise of a consensus price. */
export const EDGE_EV = 0.02;

export const decimalOdds = (american: number) => (american > 0 ? 1 + american / 100 : 1 + 100 / -american);

/** A chance as American odds, rounded the way books print them. */
export function toAmerican(p: number): number {
  const q = Math.min(Math.max(p, 0.005), 0.995);
  return Math.round(q >= 0.5 ? (-100 * q) / (1 - q) : (100 * (1 - q)) / q);
}

export const fmtAmerican = (a: number) => (a > 0 ? `+${a}` : String(a));

interface Outcome {
  book: string;
  name: string;
  price: number;
  point?: number;
}

const weight = (book: string) => (SHARP_BOOKS.has(book) ? 2 : 1);

/**
 * One market's sides for one game. Spreads and totals use the point most books deal (weighted); the home team's
 * spread and the total's over pick it. Books with every side at that point are de-vigged and averaged.
 */
export function priceMarket(key: MarketKey, outcomes: Outcome[], home: string): MarketView | undefined {
  let at = outcomes;
  if (key !== "h2h") {
    const anchor = (o: Outcome) => (key === "spreads" ? o.name === home : o.name.toLowerCase() === "over");
    const votes = new Map<number, number>();
    for (const o of outcomes) if (anchor(o) && o.point !== undefined) votes.set(o.point, (votes.get(o.point) ?? 0) + weight(o.book));
    const point = [...votes.entries()].sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]))[0]?.[0];
    if (point === undefined) return undefined;
    at = outcomes.filter((o) => (anchor(o) ? o.point === point : o.point === (key === "spreads" ? -point : point)));
  }
  const names = [...new Set(at.map((o) => o.name))];
  if (names.length < 2) return undefined;
  const byBook = new Map<string, Outcome[]>();
  for (const o of at) byBook.set(o.book, [...(byBook.get(o.book) ?? []), o]);
  const fair = new Map<string, number>();
  let total = 0;
  let books = 0;
  let sharp = false;
  for (const [book, os] of byBook) {
    if (!names.every((n) => os.some((o) => o.name === n))) continue;
    const raw = names.map((n) => impliedProb(os.find((o) => o.name === n)!.price));
    const sum = raw.reduce((a, b) => a + b, 0);
    names.forEach((n, i) => fair.set(n, (fair.get(n) ?? 0) + weight(book) * (raw[i] / sum)));
    total += weight(book);
    books++;
    sharp ||= SHARP_BOOKS.has(book);
  }
  if (!books) return undefined;
  const sides = names.map((name): SideQuote => {
    const p = fair.get(name)! / total;
    const best = at.filter((o) => o.name === name).sort((a, b) => b.price - a.price)[0];
    return {
      name,
      point: best.point,
      fair: p,
      fairPrice: toAmerican(p),
      best: { book: BOOK_NAMES[best.book] ?? best.book, price: best.price },
      ev: p * decimalOdds(best.price) - 1,
    };
  });
  // Home side last, the way scoreboards print away @ home; totals over first.
  sides.sort((a, b) => (key === "totals" ? (a.name.toLowerCase() === "over" ? -1 : 1) : (a.name === home ? 1 : 0) - (b.name === home ? 1 : 0)));
  return { key, sides, books, sharp };
}

/** The odds response for a sport (h2h, spreads, totals) as one board per game. */
export function parseGameMarkets(json: any, sport: Sport): GameBoard[] {
  const out: GameBoard[] = [];
  for (const ev of Array.isArray(json) ? json : []) {
    const home = String(ev?.home_team ?? "");
    const byMarket = new Map<MarketKey, Outcome[]>();
    for (const bm of ev?.bookmakers ?? []) {
      const book = String(bm?.key ?? "");
      for (const m of bm?.markets ?? []) {
        const key = m?.key as MarketKey;
        if (!(key in MARKET_LABEL)) continue;
        for (const o of m?.outcomes ?? []) {
          const price = Number(o?.price);
          if (!Number.isFinite(price) || !o?.name) continue;
          const point = o?.point === undefined ? undefined : Number(o.point);
          byMarket.set(key, [...(byMarket.get(key) ?? []), { book, name: String(o.name), price, point: Number.isFinite(point) ? point : undefined }]);
        }
      }
    }
    const markets = (["h2h", "spreads", "totals"] as const).map((k) => priceMarket(k, byMarket.get(k) ?? [], home)).filter((m): m is MarketView => Boolean(m));
    if (!markets.length) continue;
    out.push({ id: String(ev.id), sport, home, away: String(ev?.away_team ?? ""), start: String(ev.commence_time), markets });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** The model's points gap at which a side gets called out as one LayLock leans to. */
export const MODEL_LEAN = 0.04;

/** Add LayLock's own read to each side: the ratings model's chance, blended with the books' fair one. */
export function withModel(games: GameBoard[], ratings: Ratings | null): GameBoard[] {
  if (!ratings) return games;
  return games.map((g) => {
    const p = predict(ratings, g.home, g.away);
    if (!p) return g;
    return {
      ...g,
      markets: g.markets.map((m) => ({
        ...m,
        sides: m.sides.map((s) => {
          const side = m.key === "totals" ? (s.name.toLowerCase() === "over" ? "over" : "under") : s.name === g.home ? "home" : "away";
          const model = sideChance(g.sport, p, m.key, side, s.point);
          if (!Number.isFinite(model)) return s;
          const chance = blend(g.sport, s.fair, model, p.games);
          return { ...s, model, chance, modelEv: chance * decimalOdds(s.best.price) - 1 };
        }),
      })),
      projected: { home: p.home, away: p.away },
    };
  });
}

/** The flagged sides across a slate, best first. */
export function gameEdges(games: GameBoard[], minEv = EDGE_EV) {
  return games
    .flatMap((g) => g.markets.flatMap((m) => m.sides.filter((s) => m.books >= MIN_BOOKS && s.ev >= minEv).map((s) => ({ game: g, market: m.key, side: s }))))
    .sort((a, b) => b.side.ev - a.side.ev);
}

/** Spreads, totals and moneylines for a sport cost three credits (one per market) and are shared for hours. */
const MARKETS_TTL = () => Number(process.env.ODDS_MARKETS_TTL) || 6 * 3600;

/**
 * Every game's moneyline, spread and total for a sport. The same call feeds the game environment (spreads and
 * totals), so it's saved as the slate too and the model never pays for it twice.
 */
export async function fetchGameMarkets(sport: Sport): Promise<{ games: GameBoard[]; slate: Slate } | null> {
  if (!oddsEnabled()) return null;
  const key = `odds:markets:${sport}`;
  const cached = await kvGet<{ games: GameBoard[]; slate: Slate }>(key).catch(() => null);
  if (cached) return cached;
  if (!(await canSpend(3))) return null;
  const ttl = MARKETS_TTL();
  const json = await oddsJson(`/sports/${SPORT_KEYS[sport]}/odds?bookmakers=${PRICED_BOOKS.join(",")}&markets=h2h,spreads,totals&oddsFormat=american`, ttl);
  const out = { games: parseGameMarkets(json, sport), slate: parseSlate(json, sport) };
  await Promise.all([kvSet(key, out, ttl).catch(() => {}), kvSet(`odds:slate:${sport}`, out.slate, ttl).catch(() => {})]);
  return out;
}

// ---------- Player props, bet straight ----------

/** The sportsbooks' line for a prop and the best price on each side there. */
export interface PropBook {
  line: number;
  over?: BestPrice;
  under?: BestPrice;
}

export interface PropEdge {
  id: string;
  sport: Sport;
  player: string;
  team: string;
  opponent: string;
  stat: StatKey;
  gameTime: string;
  side: "OVER" | "UNDER";
  line: number;
  best: BestPrice;
  /** The model's chance this side wins at the books' line (pushes refund). */
  prob: number;
  push: number;
  ev: number;
}

/**
 * Each scored prop the books also deal, priced at their line with the model's chance: the better side's EV.
 * The model's distribution is restated at the books' line when it differs from the one it was scored at.
 */
export function propEdges(rows: (PropWithProjection & { book?: PropBook })[]): PropEdge[] {
  const out: PropEdge[] = [];
  for (const r of rows) {
    const b = r.book;
    const pr = r.projection;
    if (!b || pr.status !== "ok" || pr.injury) continue;
    let { pOver, pUnder, pPush } = pr;
    if (b.line !== r.line) {
      const d = pr.dispersion ?? 1.3;
      ({ pOver, pUnder, pPush } = overUnder(pr.mean, pr.mean * d, b.line));
    }
    const sides = [
      { side: "OVER" as const, p: pOver, price: b.over },
      { side: "UNDER" as const, p: pUnder, price: b.under },
    ]
      .filter((s) => s.price)
      .map((s) => ({ ...s, ev: s.p * decimalOdds(s.price!.price) + pPush - 1 }))
      .sort((a, c) => c.ev - a.ev);
    const top = sides[0];
    if (!top) continue;
    out.push({
      id: r.id,
      sport: r.sport,
      player: r.player,
      team: r.team,
      opponent: r.opponent,
      stat: r.stat,
      gameTime: r.gameTime ?? "",
      side: top.side,
      line: b.line,
      best: top.price!,
      prob: top.p,
      push: pPush,
      ev: top.ev,
    });
  }
  return out.sort((a, b) => b.ev - a.ev);
}

export const propLabel = (e: { player: string; side: "OVER" | "UNDER"; line: number; stat: StatKey }) =>
  `${e.player} ${e.side === "OVER" ? "over" : "under"} ${e.line} ${STATS[e.stat].label.toLowerCase()}`;

// ---------- Parlays ----------

export interface ParlayLeg {
  /** Fair chance the leg wins. */
  fair: number;
  /** The price you'd get on it alone (American). */
  price: number;
}

/** A parlay's fair chance (legs independent unless `joint` is given) and the EV at an offered price. */
export function priceParlay(legs: ParlayLeg[], offered?: number, joint?: number) {
  const fair = joint ?? legs.reduce((a, l) => a * l.fair, 1);
  const straight = legs.reduce((a, l) => a * decimalOdds(l.price), 1);
  const dec = offered !== undefined && Number.isFinite(offered) && offered !== 0 ? decimalOdds(offered) : straight;
  return { fair, fairPrice: toAmerican(fair), straightPrice: toAmerican(1 / straight), ev: fair * dec - 1 };
}
