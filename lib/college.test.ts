import { test } from "node:test";
import assert from "node:assert/strict";
import { legCorrelation } from "./correlation.ts";
import { envFactor } from "./environment.ts";
import { parseSearch, parseTeamPlayers } from "./espn.ts";
import { project } from "./model.ts";
import { sameTeam, type TeamEnv } from "./odds.ts";
import { isCollege, statSport, type GameLog, type Prop } from "./types.ts";

test("college sports borrow the pro stat menu", () => {
  assert.equal(statSport("CFB"), "NFL");
  assert.equal(statSport("CBB"), "NBA");
  assert.equal(statSport("NHL"), "NHL");
  assert.ok(isCollege("CFB") && !isCollege("NFL"));
});

test("search keeps players from the requested college league", () => {
  const json = {
    items: [
      { type: "player", league: "college-football", id: "1", displayName: "Arch Manning", teamRelationships: [{ core: { abbreviation: "TEX" } }] },
      { type: "player", league: "nfl", id: "2", displayName: "Peyton Manning" },
    ],
  };
  assert.deepEqual(parseSearch(json, "CFB"), [{ id: "1", name: "Arch Manning", team: "TEX" }]);
  assert.deepEqual(parseSearch(json, "NFL").map((a) => a.id), ["2"]);
});

test("college basketball team stats parse like the NBA's", () => {
  const leader = (id: string, pts: number, min: number) => ({
    athlete: { id, displayName: `P${id}`, position: { abbreviation: "G" } },
    statistics: [{ stats: [{ name: "avgPoints", value: pts }, { name: "avgMinutes", value: min }, { name: "gamesPlayed", value: 3 }] }],
  });
  const players = parseTeamPlayers({ results: [{ name: "game", leaders: [leader("1", 10, 20), leader("2", 18, 32)] }] }, "CBB");
  assert.deepEqual(players.map((p) => [p.name, p.avg.PTS]), [["P2", 18], ["P1", 10]]);
});

test("odds team names match ESPN's college short names", () => {
  assert.ok(sameTeam("Texas Longhorns", "Texas"));
  assert.ok(sameTeam("Boston Red Sox", "Red Sox"));
  assert.ok(!sameTeam("Texas Longhorns", "Tex"));
});

test("college props skip pro defense factors that share an abbreviation", () => {
  const logs: GameLog[] = Array.from({ length: 8 }, (_, i) => ({ date: `2026-10-${20 - i}`, opponent: "X", playing: 100, stats: { passYds: 230 } }));
  const prop: Prop = { id: "p", sport: "CFB", player: "QB", team: "TEX", opponent: "MIA", stat: "PASS_YDS", line: 230.5 };
  const defense = { MIA: { PASS_YDS: 1.3 } };
  const college = project({ prop, logs, defense, news: [] });
  const pro = project({ prop: { ...prop, sport: "NFL" }, logs, defense, news: [] });
  assert.ok(!college.reasons.some((r) => r.includes("matchup")));
  assert.ok(pro.mean > college.mean);
  // College factors live under their own keys.
  const own = project({ prop, logs, defense: { ...defense, "CFB:MIA": { PASS_YDS: 0.8 } }, news: [] });
  assert.ok(own.mean < college.mean);
  assert.ok(own.reasons.some((r) => r.includes("tough matchup")));
});

test("game script and blowouts carry over to college, with bigger spreads before starters sit", () => {
  const env = (spread: number): TeamEnv => ({ total: 145, spread, teamTotal: 72.5 - spread / 2, oppTotal: 72.5 + spread / 2, avgTotal: 145 });
  // A 12-point favorite: blowout trim in the NBA, not yet in college.
  assert.ok(envFactor("NBA", "PTS", env(-12), 34).reasons.some((r) => r.includes("blowout")));
  assert.ok(!envFactor("CBB", "PTS", env(-12), 34).reasons.some((r) => r.includes("blowout")));
  assert.ok(envFactor("CBB", "PTS", env(-18), 34).reasons.some((r) => r.includes("blowout")));
  const dog: TeamEnv = { total: 54, spread: 10, teamTotal: 22, oppTotal: 32, avgTotal: 54 };
  assert.ok(envFactor("CFB", "PASS_YDS", dog, 100).reasons.some((r) => r.startsWith("Game script")));
});

test("same-game correlations use the pro sport's rules", () => {
  const qb = { player: "QB", stat: "PASS_YDS" as const, side: "OVER" as const, prob: 0.5, sport: "CFB" as const, team: "TEX" };
  const wr = { ...qb, player: "WR", stat: "REC_YDS" as const };
  assert.equal(legCorrelation(qb, wr), 0.45);
});
