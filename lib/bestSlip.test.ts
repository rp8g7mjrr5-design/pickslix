import { test } from "node:test";
import assert from "node:assert/strict";
import { bestSlip } from "./bestSlip.ts";
import type { PropWithProjection } from "./types.ts";

const row = (id: string, player: string, team: string, opponent: string, pickProb: number, extra: Partial<PropWithProjection["projection"]> = {}) =>
  ({
    id, sport: "NBA", player, team, opponent, stat: "PTS", line: 20, recent: [],
    projection: {
      propId: id, mean: 21, pOver: pickProb, pUnder: 1 - pickProb, pPush: 0, pick: "OVER", pickProb, edge: pickProb - 0.5,
      confidence: "medium", sampleSize: 12, hitRateLast10: 0.6, reasons: [], status: "ok", ...extra,
    },
  }) as PropWithProjection;

test("takes the highest chances, one per game and player, skipping injured and thin samples", () => {
  const rows = [
    row("a", "A", "BOS", "NYK", 0.7),
    row("b", "B", "NYK", "BOS", 0.68), // same game as A
    row("c", "C", "LAL", "GSW", 0.66),
    row("d", "D", "MIA", "CHI", 0.69, { injury: "questionable" }),
    row("e", "E", "DEN", "PHX", 0.67, { sampleSize: 3 }),
    row("f", "F", "DAL", "HOU", 0.6),
    row("g", "A", "BOS", "NYK", 0.65), // second prop for A
  ];
  assert.deepEqual(bestSlip(rows, 3).map((r) => r.id), ["a", "c", "f"]);
  assert.deepEqual(bestSlip(rows, 2).map((r) => r.id), ["a", "c"]);
});
