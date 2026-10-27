import { test } from "node:test";
import assert from "node:assert/strict";
import { tailLegs } from "./tail.ts";

test("tails only legs whose game hasn't started", () => {
  const now = Date.parse("2026-10-27T20:00:00Z");
  const r = tailLegs(
    [
      { player: "LeBron James", stat: "PTS", line: 24.5, side: "OVER", prob: 0.6, sport: "NBA", team: "LAL", opponent: "SA", gameTime: "2026-10-28T02:00:00Z" },
      { player: "Old Game", stat: "REB", line: 8.5, side: "UNDER", prob: 0.55, sport: "NBA", team: "BOS", gameTime: "2026-10-27T19:00:00Z" },
      { player: "No Time", stat: "AST", line: 5.5, side: "OVER", prob: 0.5 },
    ],
    now,
  );
  assert.equal(r.skipped, 2);
  assert.deepEqual(r.props.map((p) => p.id), ["custom-lebron-james-pts"]);
  assert.equal(r.slip[0].propId, "custom-lebron-james-pts");
  assert.equal(r.props[0].opponent, "SA");
});
