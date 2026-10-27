import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  defenseFactors,
  nbaAllowed,
  nflAllowed,
  parseGameLog,
  parseInjuries,
  parseScoreboard,
  parseSearch,
  pickAthlete,
} from "./espn.ts";
import { canonTeam, normName } from "./names.ts";

// Trimmed copies of real ESPN responses from October 2026.
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

test("NBA game log skips preseason and reads made threes", () => {
  const logs = parseGameLog(fixture("espn-nba-gamelog"), "NBA");
  assert.equal(logs.length, 2);
  assert.deepEqual(logs[0], {
    date: "2026-10-25",
    opponent: "NO",
    playing: 44,
    stats: { pts: 35, reb: 15, ast: 10, fg3m: 3, stl: 2, blk: 3, tov: 6 },
  });
  assert.ok(logs[0].date > logs[1].date);
});

test("NFL game log maps receiving and rushing columns", () => {
  const logs = parseGameLog(fixture("espn-nfl-gamelog"), "NFL");
  assert.equal(logs.length, 3);
  assert.equal(logs[0].playing, 100);
  assert.deepEqual(logs[2].stats, { rushYds: 11, rushAtt: 1, rec: 3, recYds: 12 });
  assert.equal(logs[2].opponent, "IND");
});

test("injuries: out, IR and questionable become news; active is skipped", () => {
  const news = parseInjuries(fixture("espn-nfl-injuries"), "NFL");
  const by = Object.fromEntries(news.map((n) => [n.player, n.kind]));
  assert.equal(by["Lamar Jackson"], "player_out");
  assert.equal(by["James Conner"], "player_out");
  assert.equal(by["Olaivavega Ioane"], "player_questionable");
  assert.ok(!("Austin Hooper" in by));
  assert.equal(news.find((n) => n.player === "Lamar Jackson")?.team, "BAL");
});

test("NBA defense: each team is charged with what its opponent scored", () => {
  const games = parseScoreboard(fixture("espn-nba-scoreboard"), "NBA");
  const rows = nbaAllowed(games);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.find((r) => r.team === "UTAH")?.allowed, { pts: 132, reb: 31, ast: 19, fg3m: 20 });
  const f = defenseFactors("NBA", rows, 0);
  // With no shrinkage, Utah (allowed 132 vs a league average of 119) is a soft points matchup.
  assert.ok(f.UTAH.PTS! > 1.1);
  assert.ok(f.NY.PTS! < 1);
  assert.ok(f.UTAH.PRA);
  // Shrinkage pulls one-game samples most of the way back to 1.
  assert.ok(Math.abs(defenseFactors("NBA", rows, 8).UTAH.PTS! - 1) < 0.02);
});

test("NFL defense reads the box score from the game summary", () => {
  const rows = nflAllowed(fixture("espn-nfl-summary"));
  const den = rows.find((r) => r.team === "DEN")!;
  assert.deepEqual(den.allowed, { passYds: 240, recYds: 240, rec: 27, passAtt: 51, rushYds: 113 });
  const f = defenseFactors("NFL", rows, 0);
  assert.ok(f.DEN.REC_YDS! > 1 && f.SEA.REC_YDS! < 1);
  assert.equal(f.DEN.PASS_TD, undefined);
});

test("search picks the exact name, then the team hint", () => {
  const found = parseSearch(
    {
      items: [
        { id: "1", type: "player", league: "nfl", displayName: "Josh Allen", teamRelationships: [{ core: { abbreviation: "BUF" } }] },
        { id: "2", type: "player", league: "nfl", displayName: "Josh Hines-Allen", teamRelationships: [{ core: { abbreviation: "JAX" } }] },
        { id: "3", type: "player", league: "nfl", displayName: "Josh Allen", teamRelationships: [{ core: { abbreviation: "ARI" } }] },
        { id: "4", type: "player", league: "college-football", displayName: "Josh Allen" },
      ],
    },
    "NFL",
  );
  assert.equal(found.length, 3);
  assert.equal(pickAthlete(found, "Josh Allen")?.id, "1");
  assert.equal(pickAthlete(found, "Josh Allen", ["ARI"])?.id, "3");
  assert.equal(pickAthlete(found, "Joe Burrow"), undefined);
});

test("names and team spellings normalize", () => {
  assert.equal(normName("A.J. Brown"), normName("AJ Brown"));
  assert.equal(normName("Luka Dončić"), "luka doncic");
  assert.equal(normName("Marvin Harrison Jr."), "marvin harrison");
  assert.equal(canonTeam("gsw", "NBA"), "GS");
  assert.equal(canonTeam("WAS", "NFL"), "WSH");
  assert.equal(canonTeam("DEN", "NFL"), "DEN");
});

test("short names match on initial and last name", () => {
  const found = parseSearch(
    {
      items: [
        { id: "1", type: "player", league: "nba", displayName: "Ace Bailey", teamRelationships: [{ core: { abbreviation: "UTAH" } }] },
        { id: "2", type: "player", league: "nba", displayName: "Amari Bailey", teamRelationships: [{ core: { abbreviation: "BKN" } }] },
        { id: "3", type: "player", league: "nba", displayName: "Marvin Bagley III", teamRelationships: [{ core: { abbreviation: "WSH" } }] },
      ],
    },
    "NBA",
  );
  assert.equal(pickAthlete(found, "A. Bailey")?.id, "1");
  assert.equal(pickAthlete(found, "A. Bailey", ["BKN"])?.id, "2");
  assert.equal(pickAthlete(found, "M Bagley")?.id, "3");
  assert.equal(pickAthlete(found, "B. Bailey"), undefined);
});
