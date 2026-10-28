import { test } from "node:test";
import assert from "node:assert/strict";
import { clvSummary, legClv, sideChance } from "./clv.ts";
import type { SavedSlip, SlipLeg } from "./storage.ts";

const leg = (side: "OVER" | "UNDER", open: [number, number], close?: [number, number], line = 24.5): SlipLeg => ({
  propId: `${side}${open}${close}`, player: "A", stat: "PTS", line, side, prob: 0.6, dispersion: 1.5,
  openPrice: { line: open[0], pOver: open[1] }, ...(close ? { closePrice: { line: close[0], pOver: close[1] } } : {}),
});

test("same line: the price is the chance", () => {
  assert.ok(Math.abs(sideChance({ line: 24.5, pOver: 0.55 }, 24.5, "UNDER", 1.5) - 0.45) < 1e-9);
});

test("a book line above ours makes our over likelier", () => {
  assert.ok(sideChance({ line: 26.5, pOver: 0.5 }, 24.5, "OVER", 1.5) > 0.55);
});

test("close moving toward the pick is positive, away is negative", () => {
  assert.ok(legClv(leg("OVER", [24.5, 0.52], [24.5, 0.58]))!.diff > 0.05);
  assert.ok(legClv(leg("UNDER", [24.5, 0.52], [24.5, 0.58]))!.diff < -0.05);
  // Books moved the line up a point at the same price: good for an over at our line.
  assert.ok(legClv(leg("OVER", [24.5, 0.5], [25.5, 0.5]))!.diff > 0);
  assert.equal(legClv(leg("OVER", [24.5, 0.5])), undefined);
});

test("summary counts beats and misses", () => {
  const slip: SavedSlip = {
    id: "s", createdAt: "", entry: 5, multiplier: 3,
    legs: [leg("OVER", [24.5, 0.5], [24.5, 0.55]), leg("UNDER", [24.5, 0.5], [24.5, 0.55]), leg("OVER", [24.5, 0.5], [24.5, 0.5]), leg("OVER", [24.5, 0.5])],
  };
  const s = clvSummary([slip]);
  assert.deepEqual({ n: s.n, beat: s.beat, lost: s.lost }, { n: 3, beat: 1, lost: 1 });
});
