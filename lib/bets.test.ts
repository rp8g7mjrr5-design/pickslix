import { test } from "node:test";
import assert from "node:assert/strict";
import { betExpected, betProfit, betReturn, betStats, gradeGame, type BetLeg, type SavedBet } from "./bets.ts";
import { findFinal } from "./betGrade.ts";
import type { EspnGame } from "./espn.ts";

const leg = (o: Partial<BetLeg>): BetLeg => ({ id: Math.random().toString(), label: "", sub: "", sport: "NBA", price: -110, fair: 0.5, start: "2026-10-30T00:00:00Z", kind: "game", ...o });
const bet = (legs: BetLeg[], odds = -110, stake = 10): SavedBet => ({ id: "b", createdAt: "2026-10-29T00:00:00Z", stake, odds, legs });

test("game lines settle from the final score", () => {
  // Celtics 110, Knicks 104.
  assert.equal(gradeGame({ market: "h2h", side: "home" }, 110, 104), "hit");
  assert.equal(gradeGame({ market: "spreads", side: "home", point: -5.5 }, 110, 104), "hit");
  assert.equal(gradeGame({ market: "spreads", side: "home", point: -6 }, 110, 104), "push");
  assert.equal(gradeGame({ market: "spreads", side: "away", point: 5.5 }, 110, 104), "miss");
  assert.equal(gradeGame({ market: "totals", side: "over", point: 213.5 }, 110, 104), "hit");
  assert.equal(gradeGame({ market: "totals", side: "under", point: 214 }, 110, 104), "push");
});

test("straight bets and parlays pay at the price taken; a pushed leg drops out", () => {
  assert.equal(betReturn(bet([leg({})])), null);
  assert.ok(Math.abs(betProfit(bet([leg({ result: "hit" })]))! - 100 / 11) < 1e-9);
  assert.equal(betProfit(bet([leg({ result: "miss" })])), -10);
  assert.equal(betProfit(bet([leg({ result: "push" })])), 0);
  // +264 two-leg parlay at -110 each; one pushes, so it pays as a straight -110.
  const p = bet([leg({ result: "hit" }), leg({ result: "push" })], 264);
  assert.ok(Math.abs(betReturn(p)! - (1 + 100 / 110)) < 0.01);
});

test("record, ROI and expected profit add up", () => {
  const bs = [bet([leg({ result: "hit", fair: 0.55 })], 100), bet([leg({ result: "miss" })], 100), bet([leg({})])];
  const s = betStats(bs);
  assert.equal(s.settled, 2);
  assert.equal(s.open, 1);
  assert.equal(s.won, 1);
  assert.equal(s.profit, 0);
  assert.equal(s.roi, 0);
  assert.ok(Math.abs(s.expected - (betExpected(bs[0]).ev + betExpected(bs[1]).ev)) < 1e-9);
  assert.ok(Math.abs(betExpected(bs[0]).ev - 10 * (0.55 * 2 - 1)) < 1e-9);
});

test("finals are found by the books' full team names", () => {
  const games = [
    { id: "1", date: "", state: "post", seasonType: 2, teams: [{ abbr: "BOS", name: "Celtics", home: true, stats: {}, score: 110 }, { abbr: "NY", name: "Knicks", stats: {}, score: 104 }] },
  ] as EspnGame[];
  assert.ok(findFinal(games, "Boston Celtics", "New York Knicks"));
  assert.equal(findFinal(games, "New York Knicks", "Boston Celtics"), undefined);
});
