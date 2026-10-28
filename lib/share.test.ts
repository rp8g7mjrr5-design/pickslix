import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLegs } from "./share.ts";

test("shared legs keep only checked fields", () => {
  const legs = cleanLegs([
    { player: "Jalen Brunson", stat: "PTS", line: 26.5, side: "OVER", prob: 0.61, sport: "NBA", team: "NYK", opponent: "BOS", gameTime: "2026-10-28T23:30:00Z", evil: "<script>" },
    { player: "X", stat: "NOPE", line: 1, side: "OVER" },
    { player: "Y", stat: "REB", line: 8.5, side: "SIDEWAYS" },
    { player: "Z", stat: "AST", line: 6.5, side: "UNDER", prob: 7, sport: "XFL", gameTime: "soon" },
  ]);
  assert.equal(legs.length, 2);
  assert.equal((legs[0] as any).evil, undefined);
  assert.deepEqual([legs[1].prob, legs[1].sport, legs[1].gameTime], [0.5, undefined, undefined]);
  assert.equal(cleanLegs("nope").length, 0);
});
