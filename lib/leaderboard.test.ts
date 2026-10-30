import { test } from "node:test";
import assert from "node:assert/strict";
import { leaderStats, rank } from "./leaderboard.ts";

const saved = "2026-10-20T12:00:00Z";
const later = "2026-10-20T23:00:00Z";
const earlier = "2026-10-20T01:00:00Z";

test("counts only auto-graded picks saved before the game", () => {
  const s = leaderStats([
    { createdAt: saved, entry: 10, multiplier: 3, legs: [{ result: "hit", auto: true, gameTime: later }, { result: "hit", auto: true, gameTime: later }] },
    { createdAt: saved, entry: 10, multiplier: 3, legs: [{ result: "hit", auto: false, gameTime: later }, { result: "miss", auto: true, gameTime: later }] },
    { createdAt: saved, entry: 10, multiplier: 3, legs: [{ result: "hit", auto: true, gameTime: earlier }] },
  ]);
  assert.equal(s.picks, 3);
  assert.equal(s.hits, 2);
  // Only the first slip counts fully: +$20 on $10.
  assert.equal(s.slips, 1);
  assert.equal(s.roi, 2);
});

test("ranks by hit rate with a minimum number of picks", () => {
  const rows = [
    { name: "a", picks: 12, hits: 7, hitRate: 7 / 12, slips: 0, roi: null },
    { name: "b", picks: 4, hits: 4, hitRate: 1, slips: 0, roi: null },
    { name: "c", picks: 20, hits: 13, hitRate: 0.65, slips: 0, roi: null },
  ];
  assert.deepEqual(rank(rows).map((r) => r.name), ["c", "a"]);
});

test("a ticket whose entry or payout was changed after its game started doesn't count toward profit", () => {
  const legs = [{ result: "hit" as const, auto: true, gameTime: later }, { result: "hit" as const, auto: true, gameTime: later }];
  const before = leaderStats([{ createdAt: saved, entry: 10, multiplier: 3, legs, editedAt: saved }]);
  assert.equal(before.slips, 1);
  const after = leaderStats([{ createdAt: saved, entry: 10, multiplier: 30, legs, editedAt: "2026-10-21T01:00:00Z" }]);
  assert.equal(after.slips, 0);
  assert.equal(after.picks, 2);
});
