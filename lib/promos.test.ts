import { test } from "node:test";
import assert from "node:assert/strict";
import { bonusBet, chanceOf, hedgeBonus, noSweat, oddsBoost, profitBoost } from "./promos.ts";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("a fair bet with no promo is worth nothing", () => {
  close(oddsBoost(100, 10, 0.5).ev, 0);
  close(chanceOf(-110), 110 / 210);
});

test("profit boost multiplies the winnings, up to the max stake", () => {
  const r = profitBoost(100, 0.5, 10, 0.5);
  close(r.winProfit, 15);
  close(r.ev, 0.5 * 15 - 0.5 * 10);
  assert.equal(r.effective, 150);
  // Only $10 of a $20 bet is boosted.
  close(profitBoost(100, 0.5, 20, 0.5, 10).winProfit, 15 + 10);
});

test("bonus bets pay winnings only, and a hedge locks in most of it at long odds", () => {
  close(bonusBet(300, 10, 0.25).ev, 0.25 * 30);
  const h = hedgeBonus(300, 100, -300);
  close(h.hedge, 300 / (1 + 100 / 300));
  close(h.profit, 300 - h.hedge);
  assert.ok(h.conversion > 0.7 && h.conversion < 0.8);
});

test("a no-sweat refund turns a fair bet positive", () => {
  const r = noSweat(100, 50, 0.5, 50, 0.7);
  close(r.ev, 0.5 * 50 - 0.5 * (50 - 35));
});
