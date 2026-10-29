import { test } from "node:test";
import assert from "node:assert/strict";
import { prevWeek, standings, weekOf, weekScore } from "./contest.ts";
import type { LeaderSlip } from "./leaderboard.ts";

test("weekOf is the Monday, Eastern-ish", () => {
  assert.equal(weekOf(Date.parse("2026-10-28T20:00:00Z")), "2026-10-26");
  // Late Sunday night in New York is still that week.
  assert.equal(weekOf(Date.parse("2026-11-02T03:00:00Z")), "2026-10-26");
  assert.equal(weekOf(Date.parse("2026-11-02T06:00:00Z")), "2026-11-02");
  assert.equal(prevWeek("2026-11-02"), "2026-10-26");
});

const slip = (game: string, results: ("hit" | "miss")[], auto = true, saved = "2026-10-27T12:00:00Z"): LeaderSlip => ({
  createdAt: saved, entry: 5, multiplier: 3, legs: results.map((result) => ({ result, auto, gameTime: game })),
});

test("weekScore counts graded picks saved before games in that week", () => {
  const s = weekScore(
    [
      slip("2026-10-28T23:00:00Z", ["hit", "hit", "miss"]),
      slip("2026-10-28T23:00:00Z", ["hit"], false),
      slip("2026-10-28T23:00:00Z", ["hit"], true, "2026-10-29T01:00:00Z"),
      slip("2026-10-20T23:00:00Z", ["hit"]),
    ],
    "2026-10-26",
  );
  assert.deepEqual(s, { hits: 2, misses: 1, picks: 3, net: 1 });
});

test("standings pick a clear winner or none", () => {
  const g = "2026-10-28T23:00:00Z";
  const a = { memberId: "a", username: "amy", slips: [slip(g, ["hit", "hit", "hit", "miss"])] };
  const b = { memberId: "b", username: "bo", slips: [slip(g, ["hit", "miss", "miss"])] };
  const c = { memberId: "c", username: "cy", slips: [slip(g, ["hit", "hit", "hit", "miss"])] };
  assert.equal(standings([a, b], "2026-10-26").winner?.username, "amy");
  assert.equal(standings([a, c], "2026-10-26").winner, null);
  assert.equal(standings([{ ...a, slips: [slip(g, ["hit", "hit"])] }], "2026-10-26").winner, null);
});
