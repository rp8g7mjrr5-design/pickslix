import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeFromLogs, resultFor } from "./grade.ts";
import type { GameLog } from "./types.ts";

const log = (date: string, pts: number, playing = 30): GameLog => ({ date, opponent: "BOS", playing, stats: { pts } });
const logs = [log("2026-10-27", 31), log("2026-10-25", 18), log("2026-10-23", 25)];
const pick = { player: "X", stat: "PTS" as const, line: 25.5, side: "OVER" as const, savedAt: "2026-10-25T15:00:00Z" };

test("over, under and exact lines", () => {
  assert.equal(resultFor(26, 25.5, "OVER"), "hit");
  assert.equal(resultFor(26, 25.5, "UNDER"), "miss");
  assert.equal(resultFor(25, 25, "OVER"), "push");
});

test("finds the game by start time (an evening game is the next UTC day)", () => {
  assert.equal(gradeFromLogs({ ...pick, gameTime: "2026-10-27T23:30Z" }, logs), "hit");
  assert.equal(gradeFromLogs({ ...pick, gameTime: "2026-10-25T00:00Z" }, logs), "miss");
});

test("without a game time, the first game after the slip was saved", () => {
  assert.equal(gradeFromLogs(pick, logs), "miss");
});

test("no box score: pending until well after the game, then a push", () => {
  const p = { ...pick, gameTime: "2026-10-29T23:00Z" };
  assert.equal(gradeFromLogs(p, logs, Date.parse("2026-10-30T01:00Z")), null);
  assert.equal(gradeFromLogs(p, logs, Date.parse("2026-10-30T08:00Z")), "push");
});

test("did not play is a push", () => {
  assert.equal(gradeFromLogs({ ...pick, gameTime: "2026-10-27T23:00Z" }, [log("2026-10-27", 0, 0)]), "push");
});
