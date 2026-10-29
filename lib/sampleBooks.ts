// Demo sportsbook odds in The Odds API's shape, so DATA_SOURCE=sample shows the sportsbook page through the same
// parser as live odds. Prices are made up, with the usual spread between books and the odd stale one.
import { PRICED_BOOKS } from "./odds.ts";
import type { Sport } from "./types.ts";

interface SampleGame {
  away: string;
  home: string;
  /** Home team's fair win chance, spread and total. */
  pHome: number;
  spread: number;
  total: number;
  hoursOut: number;
}

const GAMES: Partial<Record<Sport, SampleGame[]>> = {
  NBA: [
    { away: "New York Knicks", home: "Boston Celtics", pHome: 0.68, spread: -5.5, total: 224.5, hoursOut: 5 },
    { away: "Denver Nuggets", home: "Los Angeles Lakers", pHome: 0.44, spread: 2, total: 231.5, hoursOut: 7.5 },
    { away: "Miami Heat", home: "Milwaukee Bucks", pHome: 0.61, spread: -3.5, total: 218.5, hoursOut: 6 },
  ],
  NFL: [
    { away: "Buffalo Bills", home: "Kansas City Chiefs", pHome: 0.57, spread: -2.5, total: 48.5, hoursOut: 50 },
    { away: "Dallas Cowboys", home: "Philadelphia Eagles", pHome: 0.72, spread: -6.5, total: 45.5, hoursOut: 53 },
  ],
  NHL: [
    { away: "Colorado Avalanche", home: "Edmonton Oilers", pHome: 0.55, spread: -1.5, total: 6.5, hoursOut: 8 },
  ],
  MLB: [],
  UFC: [{ away: "Islam Makhachev", home: "Arman Tsarukyan", pHome: 0.33, spread: 0, total: 0, hoursOut: 76 }],
};

const VIG = 0.024;
const american = (p: number) => Math.round(p >= 0.5 ? (-100 * p) / (1 - p) : (100 * (1 - p)) / p);

/** A two-way price around fair chance `p`, nudged per book (`tilt` > 0 favors the first side). */
const pair = (p: number, tilt: number) => [american(p + VIG / 2 - tilt), american(1 - p + VIG / 2 + tilt)];

export function sampleOddsJson(sport: Sport, now = Date.now()): any[] {
  return (GAMES[sport] ?? []).map((g, gi) => ({
    id: `sample-${sport}-${gi}`,
    commence_time: new Date(now + g.hoursOut * 3600_000).toISOString(),
    home_team: g.home,
    away_team: g.away,
    bookmakers: PRICED_BOOKS.map((book, bi) => {
      // Most books sit within a cent or two of each other; one per game hangs a stale number.
      const stale = (gi + 2) % PRICED_BOOKS.length === bi;
      const tilt = stale ? 0.03 * (gi % 2 ? 1 : -1) : ((bi * 3 + gi) % 5) / 250 - 0.008;
      const [home, away] = pair(g.pHome, tilt);
      const [hs, as] = pair(0.5, tilt / 2);
      const [over, under] = pair(0.5, ((bi + gi) % 3) / 200 - 0.005);
      const markets: any[] = [
        { key: "h2h", outcomes: [{ name: g.home, price: home }, { name: g.away, price: away }] },
      ];
      if (g.total) {
        markets.push(
          { key: "spreads", outcomes: [{ name: g.home, price: hs, point: g.spread }, { name: g.away, price: as, point: -g.spread }] },
          { key: "totals", outcomes: [{ name: "Over", price: over, point: g.total }, { name: "Under", price: under, point: g.total }] },
        );
      }
      return { key: book, markets };
    }),
  }));
}
