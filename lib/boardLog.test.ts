import { test } from "node:test";
import assert from "node:assert/strict";
import { boardEntries, boardPicks, fitBlend, fitBlends, mergeBoard, pOverAt, type BoardEntry } from "./boardLog.ts";
import type { PropWithProjection } from "./types.ts";

const NOW = Date.parse("2026-11-06T20:00:00Z");
const LATER = "2026-11-07T00:00:00Z";
const EARLIER = "2026-11-06T19:00:00Z";

const row = (player: string, extra: Partial<PropWithProjection["projection"]> = {}, gameTime = LATER, line = 20) =>
  ({
    id: player, sport: "NBA", player, team: "BOS", opponent: "NYK", stat: "PTS", line, recent: [], gameTime, pick6: true,
    projection: { propId: player, mean: 21, pOver: 0.6, pUnder: 0.4, pPush: 0, rawPOver: 0.55, rawPUnder: 0.45, pick: "OVER", pickProb: 0.6, edge: 0.1, confidence: "medium", sampleSize: 12, hitRateLast10: 0.6, reasons: [], status: "ok", ...extra },
  }) as PropWithProjection;

test("the board keeps every healthy Pick 6 line, and freezes lines once their game starts", () => {
  const entries = boardEntries([row("A"), row("B", { status: "out" }), { ...row("C"), pick6: false }, row("D", { modelMean: 22, marketMean: 19, dispersion: 1.4, market: { line: 19.5, pOver: 0.45, sharp: true } })]);
  assert.deepEqual(entries.map((e) => e.player), ["A", "D"]);
  assert.equal(entries[0].rawPOver, 0.55);
  assert.equal(entries[1].sharp, true);
  const first = mergeBoard({}, [{ ...entries[0], gameTime: EARLIER, line: 20 }], NOW - 2 * 3600_000);
  // A later scan after tip-off doesn't overwrite the pre-game line.
  const later = mergeBoard(first, [{ ...entries[0], gameTime: EARLIER, line: 25 }], NOW);
  assert.equal(later["a|PTS"].line, 20);
  assert.equal(mergeBoard({}, entries, NOW)["d|PTS"].player, "D");
});

const entry = (modelMean: number, marketMean: number, result: "over" | "under", line = 20.5): BoardEntry => ({
  sport: "NBA", player: "P", team: "BOS", opponent: "NYK", stat: "PTS", line, gameTime: LATER, rawPOver: 0.5, modelMean, marketMean, dispersion: 1.5, sharp: false, result,
});

test("the blend leans toward whichever side called the lines better", () => {
  // The books say over (24 vs 20.5), the model says under (17), and the overs keep hitting: trust the books more.
  const booksRight = Array.from({ length: 300 }, (_, i) => entry(17, 24, i % 10 < 8 ? "over" : "under"));
  const fit = fitBlend(booksRight, 0.5);
  assert.ok(fit.w > 0.5, String(fit.w));
  assert.equal(fit.n, 300);
  // And the other way round.
  const modelRight = Array.from({ length: 300 }, (_, i) => entry(24, 17, i % 10 < 8 ? "over" : "under"));
  assert.ok(fitBlend(modelRight, 0.5).w < 0.5);
  // Too few lines and nothing is learned.
  assert.deepEqual(fitBlends(booksRight.slice(0, 50)), {});
  assert.ok(fitBlends(booksRight)["NBA:books"]);
});

test("graded board lines become picks of the over at the learned blend", () => {
  const e = entry(17, 24, "over");
  const picks = boardPicks([e, { ...e, result: "push" as never }, { ...e, result: undefined }], { "NBA:books": { w: 1, n: 200 } });
  assert.equal(picks.length, 1);
  assert.equal(picks[0].side, "OVER");
  assert.equal(picks[0].hit, true);
  assert.ok(Math.abs(picks[0].rawProb - pOverAt(e, 1)) < 1e-9);
  assert.ok(pOverAt(e, 1) > pOverAt(e, 0));
  // No price from the books: the saved chance stands.
  assert.equal(pOverAt({ ...e, marketMean: undefined }, 0.7), 0.5);
});
