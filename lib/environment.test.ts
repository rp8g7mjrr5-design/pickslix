import { test } from "node:test";
import assert from "node:assert/strict";
import { envFactor } from "./environment.ts";
import { parseSlate, teamEnv } from "./odds.ts";

const book = (key: string, home: string, away: string, total: number, homeSpread: number) => ({
  key,
  markets: [
    { key: "totals", outcomes: [{ name: "Over", point: total, price: -110 }, { name: "Under", point: total, price: -110 }] },
    { key: "spreads", outcomes: [{ name: home, point: homeSpread, price: -110 }, { name: away, point: -homeSpread, price: -110 }] },
  ],
});
const ev = (id: string, home: string, away: string, total: number, spread: number) => ({
  id,
  home_team: home,
  away_team: away,
  commence_time: "2026-10-28T23:30:00Z",
  bookmakers: [book("draftkings", home, away, total, spread), book("fanduel", home, away, total + 1, spread), book("pinnacle", home, away, total, spread)],
});

test("slate reads median totals and home spreads, and averages the slate", () => {
  const slate = parseSlate(
    [
      ev("a", "Boston Celtics", "Brooklyn Nets", 220, -9.5),
      ev("b", "Denver Nuggets", "Utah Jazz", 236, -11),
      ev("c", "Miami Heat", "Orlando Magic", 210, 1.5),
      ev("d", "Los Angeles Lakers", "Phoenix Suns", 230, -2),
    ],
    "NBA",
  );
  assert.equal(slate.games.length, 4);
  assert.equal(slate.games[0].total, 220);
  assert.equal(slate.games[0].spread, -9.5);
  assert.equal(slate.avgTotal, (220 + 236 + 210 + 230) / 4);
  // Celtics favored by 9.5 in a 220 game: 114.75 to 105.25.
  const bos = teamEnv(slate, "Celtics", "Nets", "2026-10-28T23:30:00Z", true)!;
  assert.equal(bos.teamTotal, 114.75);
  assert.equal(bos.oppTotal, 105.25);
  const bkn = teamEnv(slate, "Celtics", "Nets", "2026-10-28T23:30:00Z", false)!;
  assert.equal(bkn.spread, 9.5);
  assert.equal(bkn.teamTotal, 105.25);
  assert.equal(teamEnv(slate, "Knicks", "Nets", "2026-10-28T23:30:00Z", true), undefined);
});

test("a small slate falls back to a typical total", () => {
  assert.equal(parseSlate([ev("a", "Boston Celtics", "Brooklyn Nets", 220, -3)], "NBA").avgTotal, 228);
});

test("NFL game script: underdogs throw, favorites run", () => {
  const dog = { total: 44, avgTotal: 44, spread: 7, teamTotal: 18.5, oppTotal: 25.5 };
  const fav = { ...dog, spread: -7, teamTotal: 25.5, oppTotal: 18.5 };
  const passDog = envFactor("NFL", "PASS_ATT", dog, 100);
  const rushFav = envFactor("NFL", "RUSH_YDS", fav, 100);
  // Fewer points expected, but more attempts from trailing.
  assert.ok(passDog.reasons.some((r) => /underdog/.test(r)));
  assert.ok(rushFav.factor > 1);
});

test("pitchers lose outs against a lineup expected to score", () => {
  const env = { total: 10, avgTotal: 8.6, spread: 1.5, teamTotal: 4.25, oppTotal: 5.75 };
  assert.ok(envFactor("MLB", "OUTS", env, 100).factor < 1);
  assert.ok(envFactor("MLB", "HITS_ALLOWED", env, 100).factor > 1);
  // Bench players (few minutes) don't get the blowout trim.
  const nba = { total: 226, avgTotal: 226, spread: -15, teamTotal: 120.5, oppTotal: 105.5 };
  assert.ok(!envFactor("NBA", "REB", nba, 14).reasons.some((r) => /blowout/.test(r)));
});
