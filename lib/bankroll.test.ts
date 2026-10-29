import { test } from "node:test";
import assert from "node:assert/strict";
import { chasing, suggestEntry, weekSpent, weekStart } from "./bankroll.ts";
import type { SavedSlip } from "./storage.ts";

test("weekStart is the Monday before", () => {
  const wed = new Date(2026, 9, 28, 15, 0).getTime();
  const mon = new Date(weekStart(wed));
  assert.equal(mon.getDay(), 1);
  assert.equal(mon.getDate(), 26);
  const sun = new Date(2026, 10, 1, 9).getTime();
  assert.equal(new Date(weekStart(sun)).getDate(), 26);
});

const slip = (createdAt: string, entry: number, results: ("hit" | "miss" | undefined)[] = []): SavedSlip => ({
  id: createdAt, createdAt, entry, multiplier: 3,
  legs: results.map((r, i) => ({ propId: `${i}`, player: "P", stat: "PTS", line: 1, side: "OVER", prob: 0.6, result: r })),
});

test("weekSpent counts this week's entries", () => {
  const now = new Date(2026, 9, 28, 12).getTime();
  assert.equal(weekSpent([slip(new Date(2026, 9, 27).toISOString(), 10), slip(new Date(2026, 9, 20).toISOString(), 50)], now), 10);
});

test("suggestEntry sizes by edge and stays in budget", () => {
  // 2 picks at 60% each with a 3x payout: 36% to hit, a small edge.
  assert.equal(suggestEntry(0.36, 3, 100, 0), 1);
  // A bigger edge.
  assert.equal(suggestEntry(0.4, 3, 200, 0), 5);
  // No edge, no bet.
  assert.equal(suggestEntry(0.3, 3, 100, 0), 0);
  // Budget used up.
  assert.equal(suggestEntry(0.4, 3, 100, 100), 0);
  assert.equal(suggestEntry(0.4, 3, 0, 0), 0);
});

test("chasing: three losses and a much bigger entry", () => {
  const lost = [slip("2026-10-01", 10, ["miss"]), slip("2026-10-02", 10, ["hit", "miss"]), slip("2026-10-03", 10, ["miss"])];
  assert.ok(chasing(lost, 25));
  assert.ok(!chasing(lost, 10));
  assert.ok(!chasing([...lost.slice(0, 2), slip("2026-10-03", 10, ["hit"])], 25));
  assert.ok(!chasing(lost.slice(0, 2), 25));
});
