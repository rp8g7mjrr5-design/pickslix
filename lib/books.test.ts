import { test } from "node:test";
import assert from "node:assert/strict";
import { decimalOdds, gameEdges, parseGameMarkets, priceParlay, propEdges, toAmerican } from "./books.ts";
import { parseEventLines, lineFor } from "./odds.ts";
import { sampleOddsJson } from "./sampleBooks.ts";
import type { PropWithProjection } from "./types.ts";

test("american and decimal odds round-trip", () => {
  assert.equal(decimalOdds(150), 2.5);
  assert.equal(decimalOdds(-200), 1.5);
  assert.equal(toAmerican(0.5), -100);
  assert.equal(toAmerican(0.4), 150);
});

const game = (books: [string, number, number][]) => [
  {
    id: "g1",
    commence_time: "2026-11-01T00:00:00Z",
    home_team: "Boston Celtics",
    away_team: "New York Knicks",
    bookmakers: books.map(([key, home, away]) => ({
      key,
      markets: [
        { key: "h2h", outcomes: [{ name: "Boston Celtics", price: home }, { name: "New York Knicks", price: away }] },
        { key: "totals", outcomes: [{ name: "Over", price: -110, point: 224.5 }, { name: "Under", price: -110, point: 224.5 }] },
      ],
    })),
  },
];

test("fair price is the de-vigged consensus; a stale book shows as +EV", () => {
  const [g] = parseGameMarkets(game([["pinnacle", -200, 170], ["draftkings", -210, 175], ["fanduel", -205, 172], ["betmgm", -150, 125]]), "NBA");
  const ml = g.markets.find((m) => m.key === "h2h")!;
  assert.equal(ml.books, 4);
  assert.ok(ml.sharp);
  // Away first, home last.
  assert.equal(ml.sides[1].name, "Boston Celtics");
  const home = ml.sides[1];
  assert.ok(home.fair > 0.62 && home.fair < 0.66);
  assert.equal(home.best.book, "BetMGM");
  assert.ok(home.ev > 0.02);
  assert.ok(Math.abs(ml.sides[0].fair + home.fair - 1) < 1e-9);
  const tot = g.markets.find((m) => m.key === "totals")!;
  assert.equal(tot.sides[0].name, "Over");
  assert.ok(Math.abs(tot.sides[0].fair - 0.5) < 1e-9);
  assert.ok(gameEdges([g]).some((e) => e.side.name === "Boston Celtics"));
});

test("sample odds parse into boards with all three markets", () => {
  const boards = parseGameMarkets(sampleOddsJson("NBA", Date.parse("2026-11-01T00:00:00Z")), "NBA");
  assert.equal(boards.length, 3);
  assert.deepEqual(boards[0].markets.map((m) => m.key), ["h2h", "spreads", "totals"]);
  assert.ok(boards.every((b) => b.markets.every((m) => m.books >= 3)));
});

test("each pick'em app keeps its own line; others fall back to the books", () => {
  const lines = parseEventLines(
    {
      bookmakers: [
        { key: "pick6", markets: [{ key: "player_points", outcomes: [{ name: "Over", description: "Jayson Tatum", point: 26.5 }] }] },
        { key: "prizepicks", markets: [{ key: "player_points", outcomes: [{ name: "Over", description: "Jayson Tatum", point: 27.5 }] }] },
        { key: "fanduel", markets: [{ key: "player_points", outcomes: [{ name: "Over", description: "Jayson Tatum", point: 27.5, price: -105 }, { name: "Under", description: "Jayson Tatum", point: 27.5, price: -115 }] }] },
        { key: "draftkings", markets: [{ key: "player_points", outcomes: [{ name: "Over", description: "Jayson Tatum", point: 27.5, price: -120 }, { name: "Under", description: "Jayson Tatum", point: 27.5, price: 100 }] }] },
      ],
    },
    "NBA",
  );
  const l = lines["jayson tatum"].PTS!;
  assert.equal(l.line, 26.5);
  assert.deepEqual(lineFor(l, "pick6"), { line: 26.5, book: "Pick 6", own: true });
  assert.deepEqual(lineFor(l, "prizepicks"), { line: 27.5, book: "PrizePicks", own: true });
  // Underdog hasn't posted it: Pick 6's line isn't a stand-in, the books' is.
  assert.deepEqual(lineFor(l, "underdog"), { line: 27.5, book: "Sportsbooks", own: false });
  assert.deepEqual(l.best, { over: { book: "FanDuel", price: -105 }, under: { book: "DraftKings", price: 100 } });
});

test("prop EV uses the model's chance at the books' line", () => {
  const row = {
    id: "x", sport: "NBA", player: "A", team: "BOS", opponent: "NYK", stat: "PTS", line: 26.5, gameTime: "2026-11-01T00:00:00Z", recent: [],
    projection: { propId: "x", mean: 29, pOver: 0.6, pUnder: 0.4, pPush: 0, pick: "OVER", pickProb: 0.6, edge: 0.1, confidence: "high", sampleSize: 20, hitRateLast10: 0.6, reasons: [], status: "ok", dispersion: 1.4 },
    book: { line: 26.5, over: { book: "FanDuel", price: -110 }, under: { book: "DraftKings", price: -110 } },
  } as unknown as PropWithProjection & { book: any };
  const [e] = propEdges([row]);
  assert.equal(e.side, "OVER");
  assert.ok(Math.abs(e.ev - (0.6 * decimalOdds(-110) - 1)) < 1e-9);
  // At a higher books' line the over gets harder, so EV drops.
  const [moved] = propEdges([{ ...row, book: { ...row.book, line: 29.5 } }]);
  assert.ok(moved.side === "UNDER" || moved.ev < e.ev);
});

test("parlay fair odds and EV", () => {
  const r = priceParlay([{ fair: 0.5, price: 100 }, { fair: 0.5, price: 100 }]);
  assert.equal(r.fair, 0.25);
  assert.equal(r.straightPrice, 300);
  assert.ok(Math.abs(r.ev) < 1e-9);
  assert.ok(priceParlay([{ fair: 0.5, price: 100 }, { fair: 0.5, price: 100 }], 250).ev < 0);
});
