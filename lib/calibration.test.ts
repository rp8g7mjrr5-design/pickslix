import { test } from "node:test";
import assert from "node:assert/strict";
import type { GradedPick } from "./accuracy.ts";
import { applyTune, buildCalibration, fitTune, tuneFor, tuneReason } from "./calibration.ts";
import { project } from "./model.ts";
import type { GameLog, Prop } from "./types.ts";

const pick = (prob: number, hit: boolean, side: "OVER" | "UNDER" = "OVER", sport: GradedPick["sport"] = "NBA"): GradedPick => ({
  prob, rawProb: prob, hit, sport, side, date: "2026-10-01",
});
/** n picks at `prob` that hit at `rate`. */
const batch = (n: number, prob: number, rate: number, side: "OVER" | "UNDER" = "OVER", sport: GradedPick["sport"] = "NBA") =>
  Array.from({ length: n }, (_, i) => pick(prob, i < Math.round(n * rate), side, sport));

test("no picks: change nothing", () => {
  const t = fitTune([]);
  assert.equal(t.a, 1);
  assert.equal(t.b, 0);
  assert.equal(applyTune(0.6, t), 0.6);
});

test("overconfident picks pull chances in, more so with more picks", () => {
  // Said 65% on both sides, hit 55%.
  const few = fitTune([...batch(20, 0.65, 0.55), ...batch(20, 0.65, 0.55, "UNDER")]);
  const many = fitTune([...batch(400, 0.65, 0.55), ...batch(400, 0.65, 0.55, "UNDER")]);
  assert.ok(few.a < 1 && few.a > many.a, `${few.a} ${many.a}`);
  assert.ok(Math.abs(many.b) < 0.02);
  const p = applyTune(0.65, many);
  assert.ok(p > 0.53 && p < 0.6, String(p));
});

test("overs hitting more than expected lean the tune toward overs", () => {
  const t = fitTune([...batch(300, 0.58, 0.64), ...batch(300, 0.58, 0.52, "UNDER")]);
  assert.ok(t.b > 0.05, String(t.b));
  assert.ok(applyTune(0.5, t) > 0.5);
  assert.match(tuneReason(0.5, applyTune(0.5, t), t, "OVER") ?? "", /short on overs/);
});

test("a sport needs enough picks for its own tune, and starts from the all-sports one", () => {
  const cal = buildCalibration([...batch(300, 0.65, 0.55), ...batch(300, 0.65, 0.55, "UNDER"), ...batch(10, 0.6, 1, "OVER", "NHL")]);
  assert.equal(tuneFor(cal, "NHL"), cal.all);
  assert.equal(tuneFor(cal, "NBA")?.sport, "NBA");
});

test("project applies the tune and says so", () => {
  const prop: Prop = { id: "p", player: "A", team: "NYK", opponent: "BOS", sport: "NBA", stat: "PTS", line: 20.5 };
  const logs: GameLog[] = Array.from({ length: 12 }, (_, i) => ({ date: `2026-10-${10 + i}`, opponent: "X", playing: 34, stats: { pts: 26 + (i % 3) } }));
  const base = project({ prop, logs, defense: {}, news: [] });
  const cal = { updatedAt: "", all: { a: 0.7, b: 0, n: 800 }, sports: {} };
  const tuned = project({ prop, logs, defense: {}, news: [], calibration: cal });
  assert.ok(tuned.pickProb < base.pickProb);
  assert.equal(tuned.rawPOver, base.pOver);
  assert.ok(tuned.reasons.some((r) => r.startsWith("Tuned on 800 graded picks")));
});
