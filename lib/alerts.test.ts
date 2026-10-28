import { test } from "node:test";
import assert from "node:assert/strict";
import { alertsFor, legKey, openLegs } from "./alerts.ts";
import type { SavedSlip, SlipLeg } from "./storage.ts";
import type { NewsItem } from "./types.ts";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const leg = (player: string, extra: Partial<SlipLeg> = {}): SlipLeg => ({
  propId: player, player, stat: "PTS", line: 24.5, side: "OVER", prob: 0.6, sport: "NBA", team: "NYK", gameTime: "2026-10-28T23:30:00Z", ...extra,
});
const slip = (legs: SlipLeg[]): SavedSlip => ({ id: "s", createdAt: "2026-10-28T10:00:00Z", entry: 5, multiplier: 3, legs });
const news = (player: string, kind: NewsItem["kind"]): NewsItem => ({ id: player, date: "", player, team: "NYK", kind, headline: "Ankle" });

test("watches open picks in the next day and a half only", () => {
  const legs = openLegs([slip([leg("A"), leg("B", { result: "hit" }), leg("C", { gameTime: "2026-10-27T23:00:00Z" }), leg("D", { gameTime: "2026-11-02T23:00:00Z" })])], NOW);
  assert.deepEqual(legs.map((l) => l.player), ["A"]);
});

test("ruled out and questionable, each once", () => {
  const legs = openLegs([slip([leg("Jalen Brunson"), leg("Josh Hart")])], NOW);
  const a = alertsFor(legs, [news("Jalen Brunson", "player_out"), news("Josh Hart", "player_questionable")], new Map(), new Set());
  assert.deepEqual(a.map((x) => x.title), ["Jalen Brunson is ruled out", "Josh Hart is questionable"]);
  assert.equal(alertsFor(legs, [news("Jalen Brunson", "player_out")], new Map(), new Set(a.map((x) => x.id))).length, 0);
});

test("line moves of 5+ points toward or against the pick", () => {
  const l = leg("A", { openPrice: { line: 24.5, pOver: 0.5 }, dispersion: 1.5 });
  const legs = openLegs([slip([l])], NOW);
  const up = alertsFor(legs, [], new Map([[legKey(l), { line: 24.5, pOver: 0.57 }]]), new Set());
  assert.match(up[0].title, /your way/);
  const down = alertsFor(legs, [], new Map([[legKey(l), { line: 25.5, pOver: 0.3 }]]), new Set());
  assert.match(down[0].title, /against you/);
  assert.match(down[0].body, /24.5 → 25.5/);
  assert.equal(alertsFor(legs, [], new Map([[legKey(l), { line: 24.5, pOver: 0.53 }]]), new Set()).length, 0);
});
