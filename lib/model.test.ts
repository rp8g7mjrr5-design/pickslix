import { test } from "node:test";
import assert from "node:assert/strict";
import { countPmf, overUnder, project, slipHitProbability, weightedStats } from "./model.ts";
import { buildBoard } from "./board.ts";
import { sampleProvider } from "./providers.ts";
import { sampleProps } from "./sampleData.ts";
import type { GameLog, Prop } from "./types.ts";

const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

test("pmf sums to 1 for poisson and negative binomial", () => {
  for (const [m, v] of [[5, 5], [5, 12], [28, 60]]) {
    let s = 0;
    for (let k = 0; k < 400; k++) s += countPmf(m, v, k);
    close(s, 1, 1e-6);
  }
});

test("over/under/push sum to 1 and half lines have no push", () => {
  const half = overUnder(20, 40, 20.5);
  close(half.pOver + half.pUnder + half.pPush, 1, 1e-6);
  assert.equal(half.pPush, 0);
  const whole = overUnder(20, 40, 20);
  assert.ok(whole.pPush > 0);
});

test("line far below the mean favors the over", () => {
  assert.ok(overUnder(30, 50, 20.5).pOver > 0.9);
});

test("recent games weigh more", () => {
  const { mean } = weightedStats([30, 30, 10, 10, 10, 10]);
  assert.ok(mean > (30 * 2 + 10 * 4) / 6);
});

const log = (pts: number): GameLog => ({ date: "2026-10-01", opponent: "X", playing: 34, stats: { pts, reb: 5, ast: 5, fg3m: 2 } });
const prop: Prop = { id: "p", sport: "NBA", player: "A", team: "T1", opponent: "T2", stat: "PTS", line: 24.5 };

test("soft defense and teammate out raise P(over)", () => {
  const logs = Array.from({ length: 15 }, (_, i) => log(22 + (i % 5)));
  const base = project({ prop, logs, defense: {}, news: [] });
  const soft = project({ prop, logs, defense: { T2: { PTS: 1.1 } }, news: [] });
  const boosted = project({
    prop,
    logs,
    defense: {},
    news: [{ id: "n", date: "", player: "B", team: "T1", kind: "teammate_out", headline: "", affects: ["A"], usageBoost: 0.1 }],
  });
  assert.ok(soft.pOver > base.pOver);
  assert.ok(boosted.pOver > base.pOver);
});

test("no logs gives a coin flip with low confidence", () => {
  const p = project({ prop, logs: [], defense: {}, news: [] });
  assert.equal(p.pickProb, 0.5);
  assert.equal(p.confidence, "low");
});

test("slip probability multiplies legs", () => {
  close(slipHitProbability([0.6, 0.5]), 0.3);
});

test("sample board builds and is sorted by edge", async () => {
  const board = await buildBoard(sampleProps(), sampleProvider);
  assert.ok(board.length > 20);
  for (let i = 1; i < board.length; i++) assert.ok(board[i - 1].projection.edge >= board[i].projection.edge);
  assert.equal(board.find((r) => r.player === "Jaylen Brown")?.projection.status, "out");
});

test("NFL props are on the sample board", async () => {
  const board = await buildBoard(sampleProps(), sampleProvider);
  const nfl = board.filter((r) => r.sport === "NFL");
  assert.ok(nfl.length > 10);
  for (const r of nfl) assert.ok(r.projection.mean > 0 && r.projection.pickProb >= 0.5 && r.projection.pickProb < 1);
});

test("last season's games count for less than this season's", () => {
  const now = Array.from({ length: 4 }, () => log(30));
  const old = Array.from({ length: 11 }, () => ({ ...log(15), prior: true }));
  const p = project({ prop, logs: [...now, ...old], defense: {}, news: [] });
  const flat = project({ prop, logs: [...now, ...old.map(({ prior: _, ...g }) => g)], defense: {}, news: [] });
  assert.equal(p.thisSeason, 4);
  assert.ok(p.mean > flat.mean, `${p.mean} should beat ${flat.mean}`);
  assert.notEqual(p.confidence, "high");
  assert.ok(p.reasons.some((r) => r.includes("last season")));
});

test("weightedStats scale down-weights games", () => {
  const plain = weightedStats([30, 10], 6).mean;
  const scaled = weightedStats([30, 10], 6, [1, 0.35]).mean;
  assert.ok(scaled > plain);
});
