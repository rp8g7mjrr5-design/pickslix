import { test } from "node:test";
import assert from "node:assert/strict";
import { splits, topPattern } from "./splits.ts";
import type { GameLog, Prop } from "./types.ts";

const prop: Prop = { id: "p", sport: "NBA", player: "A", team: "BOS", opponent: "NY", stat: "PTS", line: 24.5 };
const g = (date: string, pts: number, opponent = "MIA", home = true): GameLog => ({ date, opponent, playing: 34, home, stats: { pts } });

test("splits count overs at the line by opponent, venue and recent form", () => {
  const logs = [
    g("2026-10-27", 30, "NY", false),
    g("2026-10-26", 28, "PHI", false),
    g("2026-10-24", 20),
    g("2026-10-22", 31, "NY", true),
    g("2026-10-20", 18),
    g("2026-10-18", 26, "PHI", false),
    g("2026-10-16", 22),
  ];
  const list = splits(prop, logs, { home: false, gameTime: "2026-10-28T23:30:00Z" });
  const by = Object.fromEntries(list.map((s) => [s.key, s]));
  assert.deepEqual([by.last5.over, by.last5.n], [3, 5]);
  assert.deepEqual([by.opp.over, by.opp.n], [2, 2]);
  assert.equal(by.opp.label, "vs NY");
  // Road games: 30, 28, 26, all over.
  assert.deepEqual([by.venue.over, by.venue.n], [3, 3]);
  // Today is the night after the last game; past back-to-backs were 10/27 (after 10/26).
  assert.equal(by.rest, undefined);
  assert.equal(by.season.n, 7);
});

test("a lopsided split over enough games is a pattern", () => {
  const logs = Array.from({ length: 6 }, (_, i) => g(`2026-10-${String(20 - i * 2).padStart(2, "0")}`, i === 5 ? 20 : 30, "NY"));
  const list = splits(prop, logs);
  const top = topPattern(list);
  assert.equal(top?.key, "last5");
  assert.equal(top?.pattern, "OVER");
  assert.equal(list.find((s) => s.key === "opp")?.pattern, "OVER");
});

test("back-to-back split shows when today is the second night", () => {
  const logs = [g("2026-10-27", 20), g("2026-10-26", 30), g("2026-10-22", 18), g("2026-10-21", 30), g("2026-10-18", 30)];
  const rest = splits(prop, logs, { gameTime: "2026-10-28T23:30:00Z" }).find((s) => s.key === "rest");
  assert.deepEqual([rest?.over, rest?.n], [0, 2]);
});
