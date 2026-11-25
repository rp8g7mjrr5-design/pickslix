import { test } from "node:test";
import assert from "node:assert/strict";
import { autoRecord, bestPerGame, buildSlip, settle, slipText, tendSlip, toLeg as toLegFor, type AutoSlip } from "./autoSlip.ts";
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

test("takes the best More pick from every game", () => {
  const s = buildSlip(board, "NBA", "20261102", NOW)!;
  assert.ok(s);
  const names = s.legs.map((l) => l.player);
  assert.ok(!names.includes("B") && !names.includes("D") && !names.includes("H"));
  assert.deepEqual(names.slice(0, 3), ["A", "C", "E"]);
  // Every game with a healthy More pick gets one: BOS-NYK, LAL-GSW, DEN-PHX, DAL-HOU, SAC-POR (MIA-CHI is questionable, ATL-ORL too thin).
  assert.deepEqual([...names].sort(), ["A", "C", "E", "F", "G"]);
  assert.equal(s.version, 1);
});

test("no slip when fewer than two games have a More worth taking", () => {
  assert.equal(buildSlip([row("A", "BOS", "NYK", 0.5), row("C", "LAL", "GSW", 0.54, { marketProb: 0.46 })], "NBA", "20261102", NOW), null);
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

test("each sport builds from its own lines; a one-game night makes no slip", () => {
  const nfl = (player: string, team: string, opponent: string, p: number) => ({ ...row(player, team, opponent, p), sport: "NFL" as const, stat: "PASS_YDS" as const });
  const rows = [...board, nfl("Q", "DAL", "NYG", 0.7), nfl("R", "NYG", "DAL", 0.68)];
  assert.equal(buildSlip(rows, "NFL", "20261102", NOW), null);
  const s = buildSlip([...rows, nfl("S", "KC", "BUF", 0.66)], "NFL", "20261102", NOW)!;
  assert.equal(s.sport, "NFL");
  assert.deepEqual(s.legs.map((l) => l.player).sort(), ["Q", "S"]);
});

test("goes up to 8 picks when the board is deep enough", () => {
  const teams = ["BOS", "NYK", "LAL", "GSW", "MIA", "CHI", "DEN", "PHX", "DAL", "HOU", "SAC", "POR", "ATL", "ORL", "SEA", "UTA", "MIL", "IND"];
  const deep = Array.from({ length: 9 }, (_, i) => row(`P${i}`, teams[2 * i], teams[2 * i + 1], 0.8));
  const s = buildSlip(deep, "NBA", "20261102", NOW)!;
  assert.equal(s.legs.length, 8);
  assert.equal(s.multiplier, 150);
});

test("a pick needs the model leaning More and the books not leaning Less", () => {
  const rows = [
    row("A", "BOS", "NYK", 0.62, { marketProb: 0.48 }), // books lean Less: out
    row("C", "LAL", "GSW", 0.5), // coin flip: out
    row("E", "DEN", "PHX", 0.53), // no price, leans More: in
    row("F", "DAL", "HOU", 0.58, { marketProb: 0.6 }), // books agree: in
  ];
  const s = buildSlip(rows, "NBA", "20261102", NOW);
  assert.deepEqual(s?.legs.map((l) => l.player).sort(), ["E", "F"]);
});

test("Pick 6 only takes More, so Less picks are skipped and swapped off", () => {
  const unders = [row("U", "BOS", "NYK", 0.8, { pick: "UNDER" }), row("V", "LAL", "GSW", 0.79, { pick: "UNDER" })];
  const s = buildSlip([...unders, ...board], "NBA", "20261102", NOW)!;
  assert.ok(s.legs.every((l) => l.side === "OVER"));
  assert.ok(!s.legs.some((l) => l.player === "U" || l.player === "V"));
  const old: AutoSlip = { ...s, legs: [{ ...s.legs[0], player: "U", team: "BOS", opponent: "NYK", side: "UNDER" }, ...s.legs.slice(1)] };
  const tended = tendSlip(old, [...unders, ...board], NOW);
  assert.ok(tended.legs.every((l) => l.side === "OVER"));
  assert.match(tended.changes.at(-1) ?? "", /only offers More/);
});

test("games whose lines come up later get added to the slip", () => {
  const early = buildSlip([row("A", "BOS", "NYK", 0.7), row("C", "LAL", "GSW", 0.68)], "NBA", "20261102", NOW)!;
  assert.equal(early.legs.length, 2);
  const later = tendSlip(early, [row("A", "BOS", "NYK", 0.7), row("C", "LAL", "GSW", 0.68), row("E", "DEN", "PHX", 0.66), row("B", "NYK", "BOS", 0.9)], NOW);
  // E's game is new; B shares A's game, so it stays out.
  assert.deepEqual(later.legs.map((l) => l.player).sort(), ["A", "C", "E"]);
  assert.equal(later.version, 2);
  assert.match(later.changes.at(-1) ?? "", /Added E/);
  // Nothing new: nothing changes.
  assert.equal(tendSlip(later, [row("A", "BOS", "NYK", 0.7), row("C", "LAL", "GSW", 0.68), row("E", "DEN", "PHX", 0.66)], NOW).version, 2);
});

test("two picks from one game: the weaker comes off, even on a slip built earlier", () => {
  const rows = [row("A", "BOS", "NYK", 0.7), row("B", "NYK", "BOS", 0.6), row("C", "LAL", "GSW", 0.65), row("E", "DEN", "PHX", 0.62)];
  assert.deepEqual(buildSlip(rows.slice(0, 2), "NBA", "20261102", NOW), null);
  const old = { ...buildSlip([rows[0], rows[2]], "NBA", "20261102", NOW)!, legs: [rows[0], rows[1], rows[2]].map(toLegFor) };
  const t = tendSlip(old, rows, NOW);
  assert.deepEqual(t.legs.map((l) => l.player).sort(), ["A", "C", "E"]);
  assert.ok(t.changes.some((c) => /Swapped B .* same game/.test(c)));
});

test("the per-game list has every game's best More, past the slip's 8", () => {
  const teams = ["BOS", "NYK", "LAL", "GSW", "MIA", "CHI", "DEN", "PHX", "DAL", "HOU", "SAC", "POR", "ATL", "ORL", "SEA", "UTA", "MIL", "IND"];
  const rows = Array.from({ length: 9 }, (_, i) => row(`P${i}`, teams[2 * i], teams[2 * i + 1], 0.6 + i / 100));
  assert.equal(bestPerGame([...rows, row("X", "NYK", "BOS", 0.55)], "NBA", NOW).length, 9);
  assert.equal(buildSlip(rows, "NBA", "20261102", NOW)!.legs.length, 8);
});
