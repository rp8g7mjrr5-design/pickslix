import { test } from "node:test";
import assert from "node:assert/strict";
import { blend, fitRatings, normCdf, predict, sideChance, type Result } from "./ratings.ts";
import { withModel, parseGameMarkets } from "./books.ts";
import { sampleOddsJson, sampleRatings } from "./sampleBooks.ts";

const NOW = Date.parse("2026-11-01T00:00:00Z");
const day = (d: number) => new Date(NOW - d * 86400_000).toISOString();
const game = (d: number, home: string, hs: number, away: string, as: number): Result => ({
  date: day(d),
  home: { abbr: home, name: home, score: hs },
  away: { abbr: away, name: away, score: as },
});

test("normal CDF", () => {
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normCdf(1.96) - 0.975) < 1e-3);
});

test("a team that keeps winning big rates above one that keeps losing", () => {
  const results: Result[] = [];
  for (let i = 1; i <= 12; i++) {
    results.push(game(i, "Celtics", 120, "Wizards", 100), game(i + 0.5, "Knicks", 110, "Celtics", 112), game(i + 0.2, "Wizards", 105, "Knicks", 115));
  }
  const r = fitRatings("NBA", results, NOW)!;
  const net = (t: string) => r.teams[t].att + r.teams[t].def;
  assert.ok(net("Celtics") > net("Knicks") && net("Knicks") > net("Wizards"));
  const p = predict(r, "Boston Celtics", "Washington Wizards")!;
  assert.ok(p.home > p.away);
  const ml = sideChance("NBA", p, "h2h", "home");
  assert.ok(ml > 0.75);
  assert.ok(Math.abs(ml + sideChance("NBA", p, "h2h", "away") - 1) < 1e-9);
  // Laying more points is harder than winning outright; the other side of the spread is the complement.
  const cover = sideChance("NBA", p, "spreads", "home", -10.5);
  assert.ok(cover < ml);
  assert.ok(Math.abs(cover + sideChance("NBA", p, "spreads", "away", 10.5) - 1) < 1e-9);
  // A total far above the projection goes under.
  assert.ok(sideChance("NBA", p, "totals", "over", p.home + p.away + 20) < 0.2);
});

test("hockey uses goal counts, and ties split", () => {
  const p = { home: 3, away: 3, games: 20 };
  assert.ok(Math.abs(sideChance("NHL", p, "h2h", "home") - 0.5) < 1e-9);
  assert.ok(sideChance("NHL", p, "spreads", "home", -1.5) < 0.35);
  const over = sideChance("NHL", p, "totals", "over", 6.5);
  assert.ok(over > 0.3 && over < 0.5);
});

test("the model only nudges the market, less so on thin samples", () => {
  assert.equal(blend("NBA", 0.5, 0.7, 20), 0.5 + 0.25 * 0.2);
  assert.ok(blend("NBA", 0.5, 0.7, 2) < blend("NBA", 0.5, 0.7, 20));
  assert.equal(blend("NBA", 0.5, NaN, 20), 0.5);
});

test("game boards pick up model chances when both teams are rated", () => {
  const boards = withModel(parseGameMarkets(sampleOddsJson("NBA", NOW), "NBA"), sampleRatings("NBA"));
  const side = boards[0].markets[0].sides[0];
  assert.ok(boards[0].projected);
  assert.ok(side.model !== undefined && side.chance !== undefined && side.modelEv !== undefined);
  assert.ok(Math.abs(side.chance! - side.fair) <= Math.abs(side.model! - side.fair));
});
