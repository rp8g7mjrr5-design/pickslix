import { test } from "node:test";
import assert from "node:assert/strict";
import { edgeAlert, rippleLines, softLines } from "./edges.ts";
import type { SlateRow } from "./slateData.ts";

const NOW = Date.parse("2026-10-28T16:00:00Z");
const LATER = "2026-10-28T23:30:00Z";

function row(id: string, extra: Partial<SlateRow> = {}, proj: Partial<SlateRow["projection"]> = {}): SlateRow {
  return {
    id, sport: "NBA", player: `Player ${id}`, team: "MEM", opponent: "BOS", stat: "PTS", line: 26.5, gameTime: LATER, pick6: true,
    recent: [],
    projection: {
      propId: id, mean: 27, pOver: 0.55, pUnder: 0.45, pPush: 0, pick: "OVER", pickProb: 0.55, edge: 0.05, confidence: "high",
      sampleSize: 20, hitRateLast10: 0.6, reasons: [], status: "ok", dispersion: 1.2, ...proj,
    },
    ...extra,
  } as SlateRow;
}

test("softLines flags Pick 6 lines the books have moved past", () => {
  const rows = [
    // Books deal 28.5 at even money: well over 26.5.
    row("jokic", {}, { market: { line: 28.5, pOver: 0.5 } }),
    // Same line, same price: nothing to see.
    row("even", {}, { market: { line: 26.5, pOver: 0.52 } }),
    // Books lean under at the same line.
    row("under", {}, { market: { line: 26.5, pOver: 0.38 } }),
    // A sportsbook stand-in, not Pick 6's line.
    row("stand", { pick6: false }, { market: { line: 30.5, pOver: 0.5 } }),
    // No price.
    row("noprice"),
    // Ruled out.
    row("hurt", {}, { market: { line: 30.5, pOver: 0.5 }, injury: "out" }),
  ];
  const soft = softLines(rows, NOW);
  assert.ok(soft.some((e) => e.player === "Player jokic" && e.side === "OVER" && e.booksProb! > 0.6 && e.booksLine === 28.5));
  assert.ok(soft.some((e) => e.player === "Player under" && e.side === "UNDER" && Math.abs(e.booksProb! - 0.62) < 1e-9));
  assert.equal(soft.length, 2);
  // Strongest first.
  assert.ok(soft[0].booksProb! >= soft[1].booksProb!);
});

test("softLines skips games about to start", () => {
  assert.equal(softLines([row("soon", { gameTime: "2026-10-28T16:05:00Z" }, { market: { line: 29.5, pOver: 0.5 } })], NOW).length, 0);
});

test("rippleLines finds teammates bumped by an absence whose line hasn't moved", () => {
  const rows = [
    row("bane", {}, { pickProb: 0.63, pOver: 0.63, reasons: ["Averaging 22", "Ja Morant is out: +12% (4 games without)"] }),
    row("news", {}, { pickProb: 0.6, pOver: 0.6, reasons: ["Ja Morant out, usage bump 7%: more touches"] }),
    row("moved", { open: 24.5 }, { pickProb: 0.63, reasons: ["Ja Morant is out: +12% (x)"] }),
    row("small", {}, { pickProb: 0.63, reasons: ["Ja Morant is out: +2% (x)"] }),
    row("weak", {}, { pickProb: 0.54, reasons: ["Ja Morant is out: +12% (x)"] }),
    row("under", {}, { pick: "UNDER", pickProb: 0.63, reasons: ["Ja Morant is out: +12% (x)"] }),
  ];
  const ripple = rippleLines(rows, NOW);
  assert.deepEqual(ripple.map((e) => e.player), ["Player bane", "Player news"]);
  assert.equal(ripple[0].outPlayer, "Ja Morant");
  assert.equal(ripple[0].boost, 0.12);
});

test("edgeAlert reads plainly", () => {
  const [soft] = softLines([row("jokic", { player: "Nikola Jokic" }, { market: { line: 28.5, pOver: 0.5 } })], NOW);
  assert.match(edgeAlert(soft).body, /^Pick 6 has 26.5 points, books are at 28.5. More is \d+% by the books.$/);
  const [rip] = rippleLines([row("bane", { player: "Desmond Bane" }, { pickProb: 0.63, reasons: ["Ja Morant is out: +12% (x)"] })], NOW);
  assert.equal(edgeAlert(rip).title, "Ja Morant is out");
  assert.equal(edgeAlert(rip).body, "Desmond Bane's points line (26.5) hasn't moved. The model now has More at 63%.");
});
