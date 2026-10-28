import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScoreboard } from "./espn.ts";
import { LEAGUE, mlbAdjust, parseBatsThrows, parseSplits, parseTeamBatting, parseWeather, type BatLine, type MlbSlice } from "./mlb.ts";

const BAT = ["AB", "R", "H", "2B", "3B", "HR", "RBI", "BB", "HBP", "SO", "SB", "CS", "AVG", "OBP", "SLG", "OPS"];
const PITCH = ["ERA", "W", "L", "SV", "SVOP", "GP", "GS", "CG", "IP", "H", "R", "ER", "HR", "BB", "K", "OBA"];

test("hitter splits: overall and by pitcher hand", () => {
  const s = parseSplits({
    labels: BAT,
    splitCategories: [
      { name: "split", splits: [{ displayName: "All Splits", stats: ["400", "60", "120", "20", "2", "15", "60", "40", "5", "80"] }] },
      { name: "byBreakdown", splits: [{ displayName: "vs. Left", stats: ["100", "", "20", "4", "0", "2"] }, { displayName: "vs. Right", stats: ["300", "", "100", "16", "2", "13"] }] },
      { name: "byArena", splits: [{ displayName: "All Splits", stats: ["1", "", "1"] }] },
    ],
  });
  assert.deepEqual(s.all, { ab: 400, h: 120, tb: 120 + 20 + 4 + 45, bb: 40, so: 80, hbp: 5 });
  assert.equal(s.vsL.ab, 100);
  assert.equal(s.vsR.h, 100);
  assert.equal(s.ip, undefined);
});

test("pitcher splits: what hitters did against them, and innings", () => {
  const s = parseSplits({
    labels: PITCH,
    splitCategories: [
      { name: "split", splits: [{ displayName: "All Splits", stats: ["3.68", "11", "7", "0", "0", "23", "23", "0", "129.2"] }] },
      { name: "byOpponentBatting", splits: [{ displayName: "All Splits", stats: ["489", "54", "110", "23", "2", "24", "49", "27", "0", "98"] }] },
      { name: "byRightLeft", splits: [{ displayName: "vs. Left", stats: ["241", "21", "46"] }, { displayName: "vs. Right", stats: ["248", "29", "64"] }] },
    ],
  });
  assert.equal(s.ip, 129.2);
  assert.equal(s.all.ab, 489);
  assert.equal(s.all.tb, 110 + 23 + 4 + 72);
  assert.equal(s.vsL.h, 46);
});

test("bats/throws, team batting, and the forecast hour nearest first pitch", () => {
  assert.deepEqual(parseBatsThrows("Left/Right"), { bats: "L", throws: "R" });
  assert.deepEqual(parseBatsThrows("Switch/Right"), { bats: "S", throws: "R" });
  assert.deepEqual(parseBatsThrows(undefined), {});
  const team = parseTeamBatting({ results: { stats: { categories: [{ name: "batting", stats: [{ name: "atBats", value: 5564 }, { name: "hits", value: 1398 }, { name: "strikeouts", value: 1345 }, { name: "walks", value: 500 }] }] } } });
  assert.equal(team?.ab, 5564);
  assert.equal(team?.so, 1345);
  const w = parseWeather({ hourly: { time: ["2026-07-01T22:00", "2026-07-01T23:00"], temperature_2m: [88, 84], wind_speed_10m: [6, 17] } }, "2026-07-01T23:10Z");
  assert.deepEqual(w, { tempF: 84, windMph: 17 });
  assert.equal(parseWeather({ hourly: { time: ["2026-07-01T10:00"], temperature_2m: [60] } }, "2026-07-01T23:10Z"), undefined);
});

test("the scoreboard carries each team's probable starter", () => {
  const [g] = parseScoreboard(
    {
      events: [
        {
          id: "1",
          competitions: [
            {
              competitors: [
                { homeAway: "home", team: { abbreviation: "TB", id: "30" }, probables: [{ name: "probableStartingPitcher", playerId: 42604, athlete: { id: "42604", displayName: "Griffin Jax" } }] },
                { homeAway: "away", team: { abbreviation: "MIL", id: "8" } },
              ],
            },
          ],
        },
      ],
    },
    "MLB",
  );
  assert.deepEqual(g.teams[0].pitcher, { id: "42604", name: "Griffin Jax" });
  assert.equal(g.teams[1].pitcher, undefined);
});

const line = (ab: number, avg: number, slg: number, so = 0, bb = 0): BatLine => ({ ab, h: Math.round(ab * avg), tb: Math.round(ab * slg), bb, so, hbp: 0 });
const league = line(600, LEAGUE.avg, LEAGUE.slg, 150, 50);

test("a tough starter lowers a hitter's hits, scaled by the share of plate appearances and the sample", () => {
  const ace: MlbSlice = { venue: "WSH", team: "WSH", pitcherProp: false, starter: { name: "Ace", throws: "R", against: line(600, 0.18, 0.28), ip: 170 } };
  const adj = mlbAdjust("HITS", ace)!;
  assert.ok(adj.factor < 0.9 && adj.factor > 0.8);
  assert.match(adj.reasons[0], /Facing Ace \(RHP\), who has allowed \.180 AVG/);
  // Same rates over a handful of batters barely moves it.
  const rookie = mlbAdjust("HITS", { ...ace, starter: { ...ace.starter!, against: line(20, 0.18, 0.28) } });
  assert.ok(!rookie || rookie.factor > 0.97);
  // A league-average starter, neutral park: nothing to say.
  assert.equal(mlbAdjust("HITS", { ...ace, starter: { ...ace.starter!, against: league } }), undefined);
});

test("platoon: a lefty who crushes righties gets a bump against one", () => {
  const s: MlbSlice = {
    venue: "WSH",
    team: "WSH",
    pitcherProp: false,
    starter: { name: "Avg", throws: "R", against: league, ip: 150 },
    batter: { bats: "L", all: line(500, 0.26, 0.44), vsL: line(150, 0.2, 0.3), vsR: line(350, 0.286, 0.5) },
  };
  const tb = mlbAdjust("TB", s)!;
  assert.ok(tb.factor > 1.03);
  assert.match(tb.reasons[0], /Bats L vs a righty/);
  // Switch hitters skip it.
  assert.equal(mlbAdjust("TB", { ...s, batter: { ...s.batter!, bats: "S" } }), undefined);
});

test("parks count against the player's usual mix; Coors helps a visitor more than a Rockie", () => {
  const visitor = mlbAdjust("TB", { venue: "COL", team: "SF", pitcherProp: false })!;
  const rockie = mlbAdjust("TB", { venue: "COL", team: "COL", pitcherProp: false })!;
  assert.ok(visitor.factor > rockie.factor && rockie.factor > 1);
  assert.match(visitor.reasons[0], /^COL park: \+/);
  // Pitchers: hits allowed follow the park too.
  assert.ok(mlbAdjust("HITS_ALLOWED", { venue: "COL", team: "SF", pitcherProp: true })!.factor > 1);
});

test("warm open-air nights add power; domes skip the weather", () => {
  const hot = mlbAdjust("TB", { venue: "WSH", team: "WSH", pitcherProp: false, weather: { tempF: 92, windMph: 5 } })!;
  // Capped at +8%.
  assert.equal(hot.factor, 1.08);
  assert.match(hot.reasons[0], /92°F at first pitch/);
  const dome = mlbAdjust("TB", { venue: "TB", team: "TB", pitcherProp: false, weather: { tempF: 92, windMph: 5 } });
  assert.ok(!dome?.reasons.some((r) => r.includes("°F")));
});

test("pitcher props follow the lineup they face", () => {
  const whiffy: MlbSlice = { venue: "WSH", team: "WSH", pitcherProp: true, lineup: { team: "COL", line: line(5500, 0.235, 0.39, 1600, 450) } };
  const k = mlbAdjust("K", whiffy)!;
  assert.ok(k.factor > 1.1);
  assert.match(k.reasons[0], /COL's lineup strikes out/);
  // Hitter stats ignore the lineup; pitcher stats ignore the starter.
  assert.equal(mlbAdjust("HITS", whiffy), undefined);
});
