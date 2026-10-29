import { test } from "node:test";
import assert from "node:assert/strict";
import { answerFor, listFor, matchPlayer, readQuestion } from "./ask.ts";
import type { PropWithProjection } from "./types.ts";

test("readQuestion pulls out the name, stat, number and side", () => {
  assert.deepEqual(readQuestion("Is Tatum's 27.5 points safe tonight?"), { name: "Tatum", stat: "PTS", line: 27.5, side: undefined });
  assert.deepEqual(readQuestion("Jokic over 11.5 rebounds?"), { name: "Jokic", stat: "REB", line: 11.5, side: "OVER" });
  assert.deepEqual(readQuestion("should I take less on Josh Allen pass yards"), { name: "Josh Allen", stat: "PASS_YDS", line: undefined, side: "UNDER" });
  assert.equal(readQuestion("how's Shai Gilgeous-Alexander looking").name, "Shai Gilgeous-Alexander looking");
});

test("matchPlayer finds full names, then last names", () => {
  const rows = [{ player: "Jayson Tatum" }, { player: "Jalen Brunson" }, { player: "Josh Allen" }, { player: "Keenan Allen" }];
  assert.deepEqual(matchPlayer("Tatum", rows).map((r) => r.player), ["Jayson Tatum"]);
  assert.deepEqual(matchPlayer("Josh Allen", rows).map((r) => r.player), ["Josh Allen"]);
  assert.equal(matchPlayer("Allen", rows).length, 2);
  assert.equal(matchPlayer("", rows).length, 0);
});

const row = (pOver: number, extra: Partial<PropWithProjection["projection"]> = {}): PropWithProjection =>
  ({
    id: "t", sport: "NBA", player: "Jayson Tatum", team: "BOS", opponent: "NYK", stat: "PTS", line: 27.5, recent: [30, 22, 31, 28, 25],
    projection: {
      propId: "t", mean: 28.94, pOver, pUnder: 1 - pOver, pPush: 0, pick: pOver >= 0.5 ? "OVER" : "UNDER", pickProb: Math.max(pOver, 1 - pOver), edge: 0,
      confidence: "high", sampleSize: 20, hitRateLast10: 0.6, reasons: ["Averaging 28.1 over the last 10", "NYK is a soft matchup", "Hit the over in 6 of last 10"], status: "ok", ...extra,
    },
  }) as PropWithProjection;

test("answerFor reads like a person", () => {
  const a = answerFor(row(0.61, { marketProb: 0.58 }));
  assert.equal(a.headline, "Lean More: the model has it at 61%. Good, not a lock.");
  assert.deepEqual(a.lines, [
    "It expects about 28.9 points against a line of 27.5.",
    "Tatum has gone over 27.5 in 3 of the last 5.",
    "The sportsbooks agree, pricing More at 58%.",
    "Why: Averaging 28.1 over the last 10. NYK is a soft matchup.",
  ]);
  assert.match(answerFor(row(0.61), "UNDER").headline, /other way: More 61%, Less only 39%/);
  assert.match(answerFor(row(0.52)).headline, /coin flip/);
  assert.match(answerFor(row(0.7)).headline, /stronger looks/);
  assert.match(listFor([row(0.6)]), /^Tonight's lines for Jayson Tatum: Points 27.5 \(More 60%\)\.$/);
});
