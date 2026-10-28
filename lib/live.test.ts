import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { elapsedShare, parseBox, progress, type LiveBox } from "./live.ts";
import { normName } from "./names.ts";

// Trimmed copies of real ESPN game summaries from October 2026.
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

/** The same summary as if the game were still on. */
function live(json: any, period: number, clock: string, detail = "") {
  const copy = structuredClone(json);
  copy.header.competitions[0].status = { period, displayClock: clock, type: { state: "in", shortDetail: detail } };
  return copy;
}

test("parseBox reads a basketball box score", () => {
  const box = parseBox(fixture("espn-nba-summary"), "NBA");
  assert.equal(box.state, "post");
  assert.equal(box.elapsed, 1);
  assert.match(box.score, /^BKN \d+, BOS \d+$/);
  assert.deepEqual(box.players[normName("Julius Randle")], { pts: 24, fg3m: 0, reb: 9, ast: 4 });
  assert.equal(box.players[normName("Michael Porter Jr.")].fg3m, 6);
});

test("parseBox merges a football player's rushing and receiving", () => {
  const box = parseBox(fixture("espn-nfl-live-summary"), "NFL");
  assert.deepEqual(box.players[normName("Aaron Rodgers")], { passAtt: 30, passYds: 212, passTd: 1 });
  const dowdle = box.players[normName("Rico Dowdle")];
  assert.equal(dowdle.rushYds, 41);
  assert.equal(dowdle.recYds, 45);
  assert.equal(dowdle.rec, 6);
});

test("parseBox keeps hockey assists and goalie saves", () => {
  const box = parseBox(fixture("espn-nhl-summary"), "NHL");
  assert.equal(box.players[normName("Cam Talbot")].saves, 28);
  const coyle = box.players[normName("Charlie Coyle")];
  assert.equal(coyle.assists, 0);
  assert.equal(coyle.ast, undefined);
  assert.ok("shots" in coyle && "goals" in coyle);
});

test("parseBox tells baseball pitching lines from batting lines", () => {
  const box = parseBox(fixture("espn-mlb-summary"), "MLB");
  assert.deepEqual(box.players[normName("Jackson Chourio")], { runs: 0, hits: 2, rbi: 0 });
  assert.deepEqual(box.players[normName("Dustin May")], { outs: 9, hitsAllowed: 3, k: 3 });
});

test("elapsedShare follows the clock in each sport", () => {
  assert.equal(elapsedShare("NBA", "in", 3, "6:00", ""), 0.625);
  assert.equal(elapsedShare("NBA", "in", 5, "2:00", ""), 1);
  assert.equal(elapsedShare("NHL", "in", 2, "10:00", ""), 0.5);
  assert.equal(elapsedShare("CBB", "in", 1, "45.0", "") > 0.48, true);
  assert.equal(elapsedShare("NFL", "pre", 0, "", ""), 0);
  assert.equal(elapsedShare("MLB", "in", 5, "", "Top 5th"), 4 / 9);
  assert.equal(elapsedShare("MLB", "in", 5, "", "Bot 5th"), 4.5 / 9);
  assert.equal(elapsedShare("MLB", "in", 5, "", "End 5th"), 5 / 9);
});

test("progress paces a live over and an under", () => {
  // Randle's 24 points with half the game gone is a 48-point pace.
  const box = parseBox(live(fixture("espn-nba-summary"), 3, "12:00", "Q3 12:00"), "NBA");
  assert.equal(box.elapsed, 0.5);
  const over = progress({ player: "Julius Randle", stat: "PTS", line: 30.5, side: "OVER" }, box);
  assert.equal(over.value, 24);
  assert.equal(over.pace, 48);
  assert.equal(over.status, "ahead");
  const under = progress({ player: "Julius Randle", stat: "REB", line: 15.5, side: "UNDER" }, box);
  assert.equal(under.status, "behind");
  const pra = progress({ player: "Julius Randle", stat: "PRA", line: 30.5, side: "OVER" }, box);
  assert.equal(pra.value, 37);
  assert.equal(pra.status, "cashed");
  const bust = progress({ player: "Julius Randle", stat: "PTS", line: 20.5, side: "UNDER" }, box);
  assert.equal(bust.status, "busted");
});

test("progress holds off on a pace early and waits for a player not in the box", () => {
  const box = parseBox(live(fixture("espn-nba-summary"), 1, "10:00", "Q1 10:00"), "NBA");
  assert.equal(progress({ player: "Julius Randle", stat: "PTS", line: 30.5, side: "OVER" }, box).status, "early");
  assert.equal(progress({ player: "Nobody Here", stat: "PTS", line: 10.5, side: "OVER" }, box).status, "waiting");
});

test("progress settles a finished game and can't track total bases", () => {
  const box = parseBox(fixture("espn-mlb-summary"), "MLB");
  assert.equal(progress({ player: "Jackson Chourio", stat: "HITS", line: 1.5, side: "OVER" }, box).status, "hit");
  assert.equal(progress({ player: "Dustin May", stat: "K", line: 4.5, side: "OVER" }, box).status, "miss");
  const tb: LiveBox = { ...box, state: "in", elapsed: 0.5 };
  assert.equal(progress({ player: "Jackson Chourio", stat: "TB", line: 1.5, side: "OVER" }, tb).value, null);
});
