import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLines } from "./parseLines.ts";

test("one prop per line, with or without teams", () => {
  const { lines, skipped } = parseLines(`
Nikola Jokic DEN vs GS Points 27.5
Shai Gilgeous-Alexander, PTS + REB + AST, 41.5
Josh Allen BUF @ KC Pass Yds 245.5
Amon-Ra St. Brown Receptions 7.5
Anthony Edwards 3-Pointers Made 3.5
`);
  assert.deepEqual(skipped, []);
  assert.deepEqual(
    lines.map((l) => [l.player, l.stat, l.line, l.sport, l.teams.join(" ")]),
    [
      ["Nikola Jokic", "PTS", 27.5, "NBA", "DEN GS"],
      ["Shai Gilgeous-Alexander", "PRA", 41.5, "NBA", ""],
      ["Josh Allen", "PASS_YDS", 245.5, "NFL", "BUF KC"],
      ["Amon-Ra St. Brown", "REC", 7.5, "NFL", ""],
      ["Anthony Edwards", "3PM", 3.5, "NBA", ""],
    ],
  );
});

test("stacked card layout with buttons and game times", () => {
  const { lines } = parseLines(`
Nikola Jokic
C - DEN
vs GS Tue 7:00pm
27.5
Points
More
Less
Jamal Murray
DEN vs GS
Pts + Ast
28.5
More
Less
`);
  assert.deepEqual(
    lines.map((l) => [l.player, l.stat, l.line, l.teams.join(" ")]),
    [
      ["Nikola Jokic", "PTS", 27.5, "DEN GS"],
      ["Jamal Murray", "PA", 28.5, "DEN GS"],
    ],
  );
});

test("incomplete entries are reported, duplicates dropped", () => {
  const { lines, skipped } = parseLines("LeBron James Points\nLuka Doncic Rebounds 8.5\nLuka Doncic Rebounds 8.5");
  assert.equal(lines.length, 1);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0], /LeBron/);
});
