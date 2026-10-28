import { test } from "node:test";
import assert from "node:assert/strict";
import { profileStats, suggestUsername } from "./profile.ts";
import type { SavedSlip, SlipLeg } from "./storage.ts";

const leg = (player: string, prob: number, result: SlipLeg["result"], day: number, extra: Partial<SlipLeg> = {}): SlipLeg => ({
  propId: player, player, stat: "PTS", line: 20.5, side: "OVER", prob, result, sport: "NBA", gameTime: `2026-10-${String(day).padStart(2, "0")}T23:30:00Z`, ...extra,
});
const slip = (legs: SlipLeg[], entry = 10, multiplier = 3): SavedSlip => ({ id: legs[0].player, createdAt: "2026-10-01T00:00:00Z", entry, multiplier, legs });

test("record, streaks and splits from graded picks in game order", () => {
  const s = profileStats([
    slip([leg("A", 0.6, "hit", 1), leg("B", 0.55, "hit", 2)]),
    slip([leg("C", 0.7, "miss", 3), leg("D", 0.52, "hit", 4, { side: "UNDER", stat: "REB" })]),
    slip([leg("E", 0.6, "hit", 5), leg("F", 0.6, "hit", 6, { sport: "NFL", stat: "REC_YDS" })]),
    // Open and push legs don't count as picks.
    slip([leg("G", 0.6, undefined, 7), leg("H", 0.6, "push", 7)]),
  ]);
  assert.equal(s.picks, 6);
  assert.equal(s.hits, 5);
  assert.deepEqual(s.form, ["hit", "hit", "miss", "hit", "hit", "hit"]);
  assert.deepEqual(s.streak, { current: 3, kind: "hit", best: 3 });
  assert.deepEqual(s.slips, { settled: 3, won: 2, open: 1 });
  // Won two 3x slips (+20 each), lost one (−10), on $30 staked.
  assert.equal(s.profit, 30);
  assert.equal(s.roi, 1);
  assert.equal(s.bySport[0].sport, "NBA");
  assert.equal(s.bySport[0].n, 5);
  assert.equal(s.unders.n, 1);
  assert.equal(s.bestCall?.player, "D");
});

test("nothing graded", () => {
  const s = profileStats([]);
  assert.equal(s.picks, 0);
  assert.equal(s.roi, null);
  assert.deepEqual(s.streak, { current: 0, kind: null, best: 0 });
});

test("username suggestions", () => {
  assert.equal(suggestUsername("Jacob", "Smith"), "jacob_smith");
  assert.equal(suggestUsername(null, null, "big.dog99@x.com"), "big_dog99");
  assert.equal(suggestUsername("Zoë", null), "zoe");
  assert.equal(suggestUsername("A", null), "");
});
