import { test } from "node:test";
import assert from "node:assert/strict";
import { autoRecord, buildSlip, settle, slipText, tendSlip, type AutoSlip } from "./autoSlip.ts";
import type { PropWithProjection } from "./types.ts";

const NOW = Date.parse("2026-11-02T15:00:00Z");
const LATER = "2026-11-03T00:00:00Z";

const row = (player: string, team: string, opponent: string, pickProb: number, extra: Partial<PropWithProjection["projection"]> = {}, gameTime = LATER) =>
  ({
    id: player, sport: "NBA", player, team, opponent, stat: "PTS", line: 20, recent: [], gameTime, pick6: true,
    projection: {
      propId: player, mean: 21, pOver: pickProb, pUnder: 1 - pickProb, pPush: 0, pick: "OVER", pickProb, edge: pickProb - 0.5,
      confidence: "medium", sampleSize: 12, hitRateLast10: 0.6, reasons: [`why ${player}`], status: "ok", ...extra,
    },
  }) as PropWithProjection;

const board = [
  row("A", "BOS", "NYK", 0.72),
  row("B", "NYK", "BOS", 0.71), // same game as A
  row("C", "LAL", "GSW", 0.7),
  row("D", "MIA", "CHI", 0.69, { injury: "questionable" }),
  row("E", "DEN", "PHX", 0.68),
  row("F", "DAL", "HOU", 0.66),
  row("G", "SAC", "POR", 0.57),
  row("H", "ATL", "ORL", 0.65, { sampleSize: 4 }),
];

test("builds the slip size that pays best on average, one pick per game", () => {
  const s = buildSlip(board, "NBA", "20261102", NOW)!;
  assert.ok(s);
  const names = s.legs.map((l) => l.player);
  assert.ok(!names.includes("B") && !names.includes("D") && !names.includes("H"));
  assert.deepEqual(names.slice(0, 3), ["A", "C", "E"]);
  assert.ok(s.legs.length >= 2 && s.legs.length <= 6);
  assert.ok(s.expected > 1, "only builds a slip worth playing at these chances");
  assert.equal(s.version, 1);
});

test("no slip when nothing on the board is good enough", () => {
  assert.equal(buildSlip([row("A", "BOS", "NYK", 0.52), row("C", "LAL", "GSW", 0.54)], "NBA", "20261102", NOW), null);
});

test("a pick whose player is ruled out gets swapped before the game; started games stay put", () => {
  const s = buildSlip(board.slice(0, 5), "NBA", "20261102", NOW)!;
  assert.deepEqual(s.legs.map((l) => l.player).sort(), ["A", "C", "E"]);
  const after = board.map((r) => (r.player === "C" ? row("C", "LAL", "GSW", 0.7, { injury: "out" }) : r));
  const t = tendSlip(s, [...after, row("Z", "SEA", "UTA", 0.64)], NOW + 3600_000);
  assert.ok(t.legs.some((l) => l.player === "Z") || t.legs.some((l) => l.player === "F"));
  assert.ok(!t.legs.some((l) => l.player === "C"));
  assert.equal(t.version, 2);
  assert.match(t.changes[0], /^Swapped C more than 20 points for .+: ruled out$/i);

  // Once the game is about to start, even bad news leaves the pick on the slip.
  const late = tendSlip(s, after, Date.parse(LATER) - 5 * 60_000);
  assert.ok(late.legs.some((l) => l.player === "C"));
  assert.equal(late.version, 1);
});

test("settles like the app: a miss loses, a push shrinks the entry, all hits win", () => {
  const base = buildSlip(board.slice(0, 5), "NBA", "20261102", NOW)!;
  const graded = (results: ("hit" | "miss" | "push" | undefined)[]): AutoSlip => ({ ...base, legs: base.legs.map((l, i) => ({ ...l, result: results[i] })) });
  assert.equal(settle(graded(["hit", "miss", undefined])), "loss");
  assert.equal(settle(graded(["hit", "hit", undefined])), undefined);
  assert.equal(settle(graded(["hit", "hit", "hit"])), "win");
  assert.equal(settle(graded(["hit", "hit", "push"])), "win");
  const won = { ...graded(["hit", "hit", "hit"]), result: "win" as const };
  const lost = { ...graded(["hit", "miss", "hit"]), result: "loss" as const };
  const rec = autoRecord([won, lost]);
  assert.equal(rec.wins, 1);
  assert.equal(rec.losses, 1);
  assert.equal(rec.legsHit, 5);
  assert.equal(rec.legsGraded, 6);
  assert.equal(rec.profit10, 10 * (won.multiplier - 1) - 10);
  assert.match(slipText(won), /^A: More than 20 Points/);
});

test("each sport builds from its own lines; a one-game night can take two picks from it", () => {
  const nfl = (player: string, team: string, opponent: string, p: number) => ({ ...row(player, team, opponent, p), sport: "NFL" as const, stat: "PASS_YDS" as const });
  const rows = [...board, nfl("Q", "DAL", "NYG", 0.7), nfl("R", "NYG", "DAL", 0.68)];
  const s = buildSlip(rows, "NFL", "20261102", NOW)!;
  assert.equal(s.sport, "NFL");
  assert.deepEqual(s.legs.map((l) => l.player), ["Q", "R"]);
});
