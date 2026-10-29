import { test } from "node:test";
import assert from "node:assert/strict";
import { breakEvenProb, expectedReturn, hitDistribution, payoutTable, slipMultiplier, slipProfit } from "./platforms.ts";

test("hit distribution sums to one and matches the product at the top", () => {
  const d = hitDistribution([0.6, 0.5, 0.7]);
  assert.equal(d.length, 4);
  assert.ok(Math.abs(d.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.ok(Math.abs(d[3] - 0.6 * 0.5 * 0.7) < 1e-12);
  assert.ok(Math.abs(d[0] - 0.4 * 0.5 * 0.3) < 1e-12);
});

test("power play breaks even at the nth root of 1/payout", () => {
  const be = breakEvenProb(2, payoutTable("pick6", 2, "power"));
  assert.ok(Math.abs(be - Math.sqrt(1 / 3)) < 1e-6);
});

test("flex pays on a miss, so it needs a lower or similar per-pick rate than power", () => {
  const flex = payoutTable("prizepicks", 5, "flex");
  assert.deepEqual(flex, { 5: 10, 4: 2, 3: 0.4 });
  const ret = expectedReturn(hitDistribution(new Array(5).fill(0.55)), flex);
  assert.ok(ret > 0.9 && ret < 1.1);
  assert.ok(breakEvenProb(5, flex) < 0.6);
  // No flex for two picks: falls back to power.
  assert.deepEqual(payoutTable("prizepicks", 2, "flex"), { 2: 3 });
});

const legs = (...r: ("hit" | "miss" | "push")[]) => r.map((result) => ({ result }));

test("older slips pay only when every live pick hits", () => {
  assert.equal(slipMultiplier({ entry: 10, multiplier: 3, legs: legs("hit", "hit") }), 3);
  assert.equal(slipMultiplier({ entry: 10, multiplier: 6, legs: legs("hit", "hit", "push") }), 6);
  assert.equal(slipProfit({ entry: 10, multiplier: 3, legs: legs("hit", "miss") }), -10);
});

test("a slip pushed below two picks is refunded", () => {
  assert.equal(slipProfit({ entry: 10, multiplier: 3, legs: legs("hit", "push") }), 0);
});

test("flex pays by hits, and a push drops to the smaller entry's table", () => {
  const s = { entry: 10, multiplier: 10, platform: "prizepicks" as const, play: "flex" as const, tiers: { 5: 10, 4: 2, 3: 0.4 } };
  assert.equal(slipMultiplier({ ...s, legs: legs("hit", "hit", "hit", "hit", "miss") }), 2);
  assert.equal(slipMultiplier({ ...s, legs: legs("hit", "hit", "miss", "miss", "hit") }), 0.4);
  assert.equal(slipMultiplier({ ...s, legs: legs("hit", "miss", "miss", "miss", "hit") }), 0);
  // 4 live picks, 3 hits: the 4-pick flex table pays 1.5x.
  assert.equal(slipMultiplier({ ...s, legs: legs("hit", "hit", "hit", "miss", "push") }), 1.5);
});
