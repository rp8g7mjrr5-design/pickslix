import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge } from "./edges.ts";
import { addFlags, softRecord, type SoftEntry } from "./softRecord.ts";

const edge = (o: Partial<Edge> = {}): Edge => ({
  kind: "soft",
  id: "x",
  sport: "NBA",
  player: "Jayson Tatum",
  team: "BOS",
  opponent: "MIA",
  stat: "PTS",
  line: 27.5,
  side: "OVER",
  gameTime: "2026-10-28T23:30:00Z",
  prob: 0.6,
  booksProb: 0.6,
  ...o,
});

test("logs a soft line once a day, even if its line moves", () => {
  const first = addFlags({}, [edge()], 0)!;
  assert.equal(Object.keys(first).length, 1);
  assert.equal(addFlags(first, [edge({ line: 28.5 })], 1), null);
  const more = addFlags(first, [edge({ stat: "REB", line: 8.5 }), edge({ kind: "ripple" })], 1)!;
  assert.equal(Object.keys(more).length, 2);
});

test("the record counts hits and misses, not pushes", () => {
  const e = (result: SoftEntry["result"], gameTime: string): SoftEntry => ({ ...edge({ gameTime }), at: gameTime, result });
  const r = softRecord([[e("hit", "2026-10-27T00:00:00Z"), e("miss", "2026-10-26T00:00:00Z")], [e("push", "2026-10-25T00:00:00Z"), e(undefined, "2026-10-28T00:00:00Z")], []]);
  assert.deepEqual([r.hits, r.misses, r.pushes, r.rate, r.days], [1, 1, 1, 0.5, 2]);
  assert.equal(r.recent[0].result, "hit");
  assert.equal(softRecord([]).rate, null);
});
