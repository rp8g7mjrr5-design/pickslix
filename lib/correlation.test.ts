import { test } from "node:test";
import assert from "node:assert/strict";
import { correlatedHitProbability, legCorrelation, normInv, type CorrLeg } from "./correlation.ts";

const leg = (player: string, stat: CorrLeg["stat"], side: CorrLeg["side"], team: string, opponent: string, prob = 0.6): CorrLeg => ({
  player, stat, side, prob, sport: "NFL", team, opponent,
});

test("inverse normal matches known points", () => {
  assert.ok(Math.abs(normInv(0.5)) < 1e-9);
  assert.ok(Math.abs(normInv(0.975) - 1.959964) < 1e-5);
  assert.ok(Math.abs(normInv(0.01) + 2.326348) < 1e-5);
});

test("unrelated legs multiply exactly", () => {
  const r = correlatedHitProbability([leg("A", "PASS_YDS", "OVER", "KC", "BUF"), leg("B", "REC_YDS", "OVER", "DAL", "NYG")]);
  assert.equal(r.prob, 0.36);
  assert.equal(r.linked.length, 0);
});

test("a QB and his receiver both over hit together more often", () => {
  const legs = [leg("Mahomes", "PASS_YDS", "OVER", "KC", "BUF"), leg("Kelce", "REC_YDS", "OVER", "KC", "BUF")];
  assert.equal(legCorrelation(legs[0], legs[1]), 0.45);
  const r = correlatedHitProbability(legs);
  assert.deepEqual(r.linked, [[0, 1]]);
  assert.ok(r.prob > 0.4 && r.prob < 0.46, String(r.prob));
});

test("an over and an under on linked stats fight each other", () => {
  const r = correlatedHitProbability([leg("Mahomes", "PASS_YDS", "OVER", "KC", "BUF"), leg("Kelce", "REC_YDS", "UNDER", "KC", "BUF")]);
  assert.ok(r.prob < 0.33, String(r.prob));
});

test("same player, overlapping stats are strongly linked; opponents mildly", () => {
  const nba = (player: string, stat: CorrLeg["stat"], team: string, opponent: string): CorrLeg => ({ player, stat, side: "OVER", prob: 0.55, sport: "NBA", team, opponent });
  assert.equal(legCorrelation(nba("Tatum", "PTS", "BOS", "NY"), nba("Tatum", "PRA", "BOS", "NY")), 0.75);
  assert.equal(legCorrelation(nba("Tatum", "PTS", "BOS", "NY"), nba("Brunson", "PTS", "NY", "BOS")), 0.1);
  assert.equal(legCorrelation(nba("Tatum", "PTS", "BOS", "NY"), nba("Doncic", "PTS", "LAL", "DEN")), 0);
});

test("the same slip always gets the same number", () => {
  const legs = [leg("Mahomes", "PASS_YDS", "OVER", "KC", "BUF"), leg("Kelce", "REC_YDS", "OVER", "KC", "BUF"), leg("Allen", "PASS_YDS", "OVER", "BUF", "KC")];
  assert.equal(correlatedHitProbability(legs).prob, correlatedHitProbability(legs).prob);
});
