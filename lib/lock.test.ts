import { test } from "node:test";
import assert from "node:assert/strict";
import { badgesFor, buildMenu, canPick, lockRecord, nextBadge, type LockEntry, type LockOption } from "./lock.ts";
import type { PropWithProjection } from "./types.ts";

const NOW = Date.parse("2026-10-28T16:00:00Z");
const LATER = "2026-10-28T23:30:00Z";

function row(player: string, team: string, pickProb = 0.58, extra: Partial<PropWithProjection["projection"]> = {}, gameTime = LATER): PropWithProjection {
  return {
    id: player, sport: "NBA", player, team, opponent: "OPP", stat: "PTS", line: 20.5, gameTime, recent: [],
    projection: {
      propId: player, mean: 21, pOver: pickProb, pUnder: 1 - pickProb, pPush: 0, pick: "OVER", pickProb, edge: pickProb - 0.5,
      confidence: "medium", sampleSize: 20, hitRateLast10: 0.5, reasons: [], status: "ok", ...extra,
    },
  } as PropWithProjection;
}

test("buildMenu picks close calls from different players, two per team at most", () => {
  const rows = [
    row("A", "BOS"), row("B", "BOS"), row("C", "BOS"), row("D", "NYK"), row("E", "MIA"),
    row("Lock", "LAL", 0.8), row("Hurt", "LAL", 0.55, { injury: "questionable" }), row("Thin", "LAL", 0.55, { sampleSize: 3 }),
    row("Soon", "GSW", 0.55, {}, "2026-10-28T16:20:00Z"), row("F", "DEN"),
  ];
  const menu = buildMenu(rows, "20261028", NOW)!;
  assert.equal(menu.options.length, 5);
  const names = menu.options.map((o) => o.player);
  assert.ok(!names.includes("C"), "a third BOS player is left out");
  for (const bad of ["Lock", "Hurt", "Thin", "Soon"]) assert.ok(!names.includes(bad), bad);
  assert.equal(new Set(menu.options.map((o) => o.id)).size, 5);
  assert.equal(buildMenu(rows.slice(0, 2), "20261028", NOW), null);
});

const opt = (gameTime: string): LockOption => ({ id: "x", sport: "NBA", player: "A", team: "T", opponent: "O", stat: "PTS", line: 1.5, gameTime, lean: "OVER", leanProb: 0.6 });

test("canPick stops changes once either game starts", () => {
  assert.equal(canPick(opt(LATER), undefined, NOW), null);
  assert.match(canPick(opt("2026-10-28T15:00:00Z"), undefined, NOW)!, /started/);
  const current = { date: "d", option: opt("2026-10-28T15:30:00Z"), side: "OVER", at: "" } as LockEntry;
  assert.match(canPick(opt(LATER), current, NOW)!, /set for today/);
});

const e = (date: string, result?: LockEntry["result"]) => ({ date, option: opt(LATER), side: "OVER", at: "", result }) as LockEntry;

test("lockRecord: misses reset the streak, pushes and skipped days don't", () => {
  const r = lockRecord([e("20261001", "hit"), e("20261002", "hit"), e("20261003", "miss"), e("20261005", "hit"), e("20261006", "push"), e("20261008", "hit"), e("20261009")]);
  assert.deepEqual(r, { hits: 4, misses: 1, pushes: 1, streak: 2, best: 2 });
  assert.equal(lockRecord([]).streak, 0);
});

test("badges", () => {
  assert.deepEqual(badgesFor(12), [5, 10]);
  assert.equal(nextBadge(12), 20);
  assert.equal(nextBadge(25), undefined);
});
