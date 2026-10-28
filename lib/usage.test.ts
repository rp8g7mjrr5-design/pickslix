import { test } from "node:test";
import assert from "node:assert/strict";
import { project } from "./model.ts";
import { buildUsageSlice, teamShares, usageAdjust, type RosterPlayer } from "./usage.ts";
import type { GameLog, NewsItem, Prop } from "./types.ts";

const day = (i: number) => new Date(Date.UTC(2026, 9, 27) - i * 86400_000).toISOString().slice(0, 10);
const log = (i: number, pts: number, prior = false): GameLog => ({ date: day(i), opponent: "X", playing: 34, stats: { pts, reb: 5, ast: 4 }, prior });

const roster: RosterPlayer[] = [
  { name: "Star Guard", games: 10, avg: { PTS: 30, REB: 5, AST: 8 } },
  { name: "Wing Player", games: 10, avg: { PTS: 20, REB: 5, AST: 4 } },
  { name: "Big Man", games: 10, avg: { PTS: 10, REB: 10, AST: 2 } },
  { name: "Bench Guy", games: 10, avg: { PTS: 10, REB: 3, AST: 1 } },
];
const out = (player: string): NewsItem => ({ id: player, date: day(0), player, team: "HOU", kind: "player_out", headline: `${player} out` });

test("team shares weight season averages by games played", () => {
  const s = teamShares(roster, "Star Guard");
  assert.equal(s.PTS, 30 / 70);
  assert.equal(s.AST, 8 / 15);
  assert.deepEqual(teamShares(roster, "Nobody"), {});
});

test("with/without splits this player's season by the dates the teammate played", () => {
  // Wing scores 20 with the star (even days), 28 without (odd days). The star played the most recent game.
  const logs = Array.from({ length: 10 }, (_, i) => log(i, i % 2 ? 28 : 20));
  const starLogs = logs.filter((_, i) => i % 2 === 0).map((g) => ({ ...g }));
  const slice = buildUsageSlice("Wing Player", logs, roster, [out("Star Guard")], new Map([["star guard", starLogs]]));
  assert.equal(slice.length, 1);
  assert.equal(slice[0].with.n, 5);
  assert.equal(slice[0].without.n, 5);
  assert.equal(slice[0].with.avg.PTS, 20);
  assert.equal(slice[0].without.avg.PTS, 28);

  const adj = usageAdjust("PTS", slice)!;
  // Five games without: weight 5/11 on +40%, the rest on the share prior (0.35 * 3/7 / (4/7) ≈ 0.26), capped at +20%.
  assert.equal(adj.factor, 1.2);
  assert.match(adj.reasons[0], /Star Guard is out: \+20% \(28\.0 in 5 games without, 20\.0 with\)/);
});

test("thin samples lean on the share of production left behind", () => {
  const logs = Array.from({ length: 6 }, (_, i) => log(i, 20));
  const slice = buildUsageSlice("Wing Player", logs, roster, [out("Big Man")], new Map([["big man", logs]]));
  const adj = usageAdjust("REB", slice)!;
  // Big Man has 10 of 23 rebounds: 0.35 * (10/23) / (13/23) ≈ +27%, capped at +20%. No games without them yet.
  assert.equal(adj.factor, 1.2);
  assert.match(adj.reasons[0], /43% of the team's rebounds to go around/);
  const pts = usageAdjust("PTS", slice)!;
  assert.ok(Math.abs(pts.factor - (1 + (0.35 * (10 / 70)) / (60 / 70))) < 1e-9);
});

test("no bump for bench players, long absences, other sports, or the player themself", () => {
  const logs = Array.from({ length: 8 }, (_, i) => log(i, 20));
  const short = roster.map((p) => (p.name === "Bench Guy" ? { ...p, games: 1 } : p));
  assert.deepEqual(buildUsageSlice("Wing Player", logs, short, [out("Bench Guy")], new Map([["bench guy", logs]])), []);
  // The star hasn't played in any of the last five: the recent average already has the star out.
  const old = logs.slice(5);
  assert.deepEqual(buildUsageSlice("Wing Player", logs, roster, [out("Star Guard")], new Map([["star guard", old]])), []);
  assert.deepEqual(buildUsageSlice("Star Guard", logs, roster, [out("Star Guard")], new Map([["star guard", logs]])), []);
  // Last season's games don't count for with/without.
  const prior = logs.map((g) => ({ ...g, prior: true }));
  assert.deepEqual(buildUsageSlice("Wing Player", prior, roster, [out("Star Guard")], new Map([["star guard", logs]]))[0].with.n, 0);
  assert.equal(usageAdjust("SOG", [{ name: "x", headline: "", share: {}, with: { n: 0, avg: {} }, without: { n: 0, avg: {} } }]), undefined);
  assert.equal(usageAdjust("PTS", []), undefined);
});

test("the bump feeds the projection as an adjustment", () => {
  const logs = Array.from({ length: 10 }, (_, i) => log(i, 20));
  const prop: Prop = { id: "p", sport: "NBA", player: "Wing Player", team: "HOU", opponent: "X", stat: "PTS", line: 21.5 };
  const slice = buildUsageSlice("Wing Player", logs, roster, [out("Star Guard")], new Map([["star guard", logs.slice(0, 1)]]));
  const base = project({ prop, logs, defense: {}, news: [] });
  const bumped = project({ prop, logs, defense: {}, news: [], adjust: usageAdjust("PTS", slice) });
  assert.ok(bumped.modelMean! > base.modelMean!);
  assert.ok(bumped.reasons.some((r) => r.startsWith("Star Guard is out")));
});
