import { test } from "node:test";
import assert from "node:assert/strict";
import { legDetail, recapLine, settled, type RecapLeg } from "./recap.ts";

const leg = (player: string, side: "OVER" | "UNDER", line: number, result: RecapLeg["result"], actual?: number): RecapLeg => ({ player, stat: "PTS", line, side, result, actual });

test("recapLine names the closest miss", () => {
  const legs = [leg("Jayson Tatum", "OVER", 27.5, "hit", 31), leg("Ja Morant", "OVER", 24.5, "miss", 23), leg("Luka Doncic", "OVER", 30.5, "miss", 18), leg("A B", "UNDER", 10.5, "hit", 8), leg("C D", "OVER", 5.5, "hit", 9)];
  assert.equal(recapLine(legs), "3 of 5 hit. Morant missed by 1.5.");
});

test("recapLine on a sweep calls out a sweat", () => {
  assert.equal(recapLine([leg("Jayson Tatum", "OVER", 27.5, "hit", 28), leg("X Y", "UNDER", 9.5, "hit", 3)]), "All 2 hit. Tatum cleared by 0.5.");
  assert.equal(recapLine([leg("Jayson Tatum", "OVER", 27.5, "hit", 35), leg("X Y", "UNDER", 9.5, "hit")]), "All 2 hit.");
});

test("recapLine handles pushes and unknown values", () => {
  assert.equal(recapLine([leg("A", "OVER", 1.5, "push"), leg("B", "OVER", 1.5, "miss")]), "0 of 1 hit. 1 push.");
  assert.equal(recapLine([leg("A", "OVER", 1.5, "push")]), "All pushed.");
  assert.ok(settled([leg("A", "OVER", 1.5, "hit")]));
  assert.ok(!settled([leg("A", "OVER", 1.5, undefined)]));
  assert.equal(legDetail(leg("A", "OVER", 27.5, "hit", 31)), "31 points (line 27.5)");
});
