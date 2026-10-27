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

test("picks from a saved entry keep their side; a card with both buttons has none", () => {
  const { lines } = parseLines(`
Nikola Jokic
DEN vs GS
More than 27.5 Points
Josh Allen BUF Pass Yds u245.5
Jamal Murray
27.5
Points
More
Less
`);
  assert.deepEqual(
    lines.map((l) => [l.player, l.stat, l.line, l.side]),
    [
      ["Nikola Jokic", "PTS", 27.5, "OVER"],
      ["Josh Allen", "PASS_YDS", 245.5, "UNDER"],
      ["Jamal Murray", "PTS", 27.5, undefined],
    ],
  );
});

test("on-device OCR of a saved entry: badges on the name line or on their own line", () => {
  // Real output from the in-browser reader on a mock entry screenshot.
  const { lines } = parseLines(`My Entry
3 Picks - $10 to pay $60
Nikola Jokic More.
C - DEN 27.5
vs GS Tue 9:00pm Points
Shai Gilgeous-Alexander Less.
G - OKC 40.5
@ PHX Tue 7:00pm Pts + Reb + Ast
More
Josh Allen : :
QB - BUF 245.5
@ BAL Sun 1:00pm Pass Yds`);
  assert.deepEqual(
    lines.map((l) => [l.player, l.stat, l.line, l.side, l.teams.join(" ")]),
    [
      ["Nikola Jokic", "PTS", 27.5, "OVER", "DEN GS"],
      ["Shai Gilgeous-Alexander", "PRA", 40.5, "UNDER", "OKC PHX"],
      ["Josh Allen", "PASS_YDS", 245.5, "OVER", "BUF BAL"],
    ],
  );
});
