import { test } from "node:test";
import assert from "node:assert/strict";
import { choosePick, potdRecord, type Potd } from "./potd.ts";
import type { PropWithProjection } from "./types.ts";

const NOW = Date.parse("2026-10-28T16:00:00Z");
const LATER = "2026-10-28T23:30:00Z";

function row(id: string, pickProb: number, extra: Partial<PropWithProjection["projection"]> = {}, gameTime = LATER): PropWithProjection {
  return {
    id, sport: "NBA", player: `Player ${id}`, team: "BOS", opponent: "NYK", stat: "PTS", line: 20.5, gameTime,
    projection: {
      propId: id, mean: 23, pOver: pickProb, pUnder: 1 - pickProb, pPush: 0, pick: "OVER", pickProb, edge: pickProb - 0.5,
      confidence: "high", sampleSize: 20, hitRateLast10: 0.6, reasons: ["Averaging 24.1", "Weak defense", "Third reason"], status: "ok",
      ...extra,
    },
  } as PropWithProjection;
}

test("choosePick takes the model's strongest clean line", () => {
  const pick = choosePick([row("a", 0.61), row("b", 0.66), row("c", 0.63)], "20261028", NOW);
  assert.equal(pick?.player, "Player b");
  assert.equal(pick?.side, "OVER");
  assert.equal(pick?.date, "20261028");
  assert.deepEqual(pick?.reasons, ["Averaging 24.1", "Weak defense"]);
});

test("choosePick skips injuries, thin samples, low confidence, games about to start and books leaning the other way", () => {
  const rows = [
    row("hurt", 0.8, { injury: "questionable" }),
    row("thin", 0.79, { sampleSize: 4 }),
    row("low", 0.78, { confidence: "low" }),
    row("soon", 0.77, {}, "2026-10-28T16:10:00Z"),
    row("fade", 0.76, { marketProb: 0.42 }),
    row("out", 0.75, { status: "out" }),
    row("ok", 0.6),
  ];
  assert.equal(choosePick(rows, "20261028", NOW)?.player, "Player ok");
  assert.equal(choosePick(rows.slice(0, 6), "20261028", NOW), null);
});

test("choosePick leans toward picks the books agree with", () => {
  const pick = choosePick([row("model", 0.64), row("both", 0.63, { marketProb: 0.58 })], "20261028", NOW);
  assert.equal(pick?.player, "Player both");
  assert.equal(pick?.marketProb, 0.58);
});

test("potdRecord counts results and the current streak", () => {
  const p = (date: string, result?: Potd["result"]) => ({ date, result }) as Potd;
  const rec = potdRecord([p("20261020", "miss"), p("20261021", "hit"), p("20261022", "push"), p("20261023", "hit"), p("20261024", "hit"), p("20261025")]);
  assert.deepEqual(rec, { hits: 3, misses: 1, pushes: 1, streak: 3 });
  assert.equal(potdRecord([p("20261024", "hit"), p("20261025", "miss"), p("20261026", "miss")]).streak, -2);
});
