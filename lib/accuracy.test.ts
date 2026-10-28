import { test } from "node:test";
import assert from "node:assert/strict";
import { accuracyReport } from "./accuracy.ts";
import type { SavedSlip, SlipLeg } from "./storage.ts";

const leg = (player: string, prob: number, result: SlipLeg["result"], extra: Partial<SlipLeg> = {}): SlipLeg => ({
  propId: player, player, stat: "PTS", line: 24.5, side: "OVER", prob, result, auto: true, sport: "NBA", gameTime: "2026-10-27T23:30:00Z", ...extra,
});
const slip = (legs: SlipLeg[], createdAt = "2026-10-27T18:00:00Z"): SavedSlip => ({ id: "s", createdAt, entry: 10, multiplier: 3, legs });

test("counts each graded pick once, bucketed by the model's chance", () => {
  const r = accuracyReport([
    slip([leg("A", 0.62, "hit"), leg("B", 0.57, "miss")]),
    // Someone tailed A: still one pick.
    slip([leg("A", 0.62, "hit"), leg("C", 0.7, "hit")]),
    // Hand-marked, a push, and a pick saved after the game started don't count.
    slip([leg("D", 0.6, "hit", { auto: false }), leg("E", 0.6, "push")]),
    slip([leg("F", 0.6, "miss")], "2026-10-28T02:00:00Z"),
  ]);
  assert.equal(r.picks, 3);
  assert.equal(r.hits, 2);
  assert.deepEqual(r.buckets.map((b) => b.n), [0, 1, 1, 1]);
  assert.equal(r.bySport[0].sport, "NBA");
  // (0.38² + 0.57² + 0.3²) / 3
  assert.ok(Math.abs(r.brier! - (0.38 ** 2 + 0.57 ** 2 + 0.3 ** 2) / 3) < 1e-9);
});

test("empty when nothing is graded", () => {
  const r = accuracyReport([]);
  assert.equal(r.picks, 0);
  assert.equal(r.brier, null);
});
