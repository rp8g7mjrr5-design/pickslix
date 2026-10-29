import { test } from "node:test";
import assert from "node:assert/strict";
import { crowdCounts, crowdKey, crowdLean, disagreements } from "./crowd.ts";
import { hotSpots, spotLines } from "./hotspots.ts";
import { suggestPairs } from "./pairs.ts";
import type { LiteRow } from "./slateLite.ts";
import type { SavedSlip } from "./storage.ts";

const lite = (player: string, team: string, opponent: string, stat: LiteRow["stat"], pick: "OVER" | "UNDER", pickProb: number, sport: LiteRow["sport"] = "NFL"): LiteRow => ({
  id: player + stat, sport, player, team, opponent, stat, line: 10.5, gameTime: "", pOver: pick === "OVER" ? pickProb : 1 - pickProb, pUnder: pick === "OVER" ? 1 - pickProb : pickProb, pick, pickProb,
});

test("suggestPairs finds the QB's receiver and skips picks that fight the slip", () => {
  const legs = [{ player: "Josh Allen", stat: "PASS_YDS" as const, side: "OVER" as const, prob: 0.6, sport: "NFL" as const, team: "BUF", opponent: "MIA" }];
  const rows = [
    lite("Josh Allen", "BUF", "MIA", "PASS_YDS", "OVER", 0.6),
    lite("Khalil Shakir", "BUF", "MIA", "REC_YDS", "OVER", 0.58),
    lite("Dalton Kincaid", "BUF", "MIA", "REC", "UNDER", 0.6),
    lite("James Cook", "BUF", "MIA", "RUSH_YDS", "OVER", 0.6),
    lite("Weak Guy", "BUF", "MIA", "REC_YDS", "OVER", 0.51),
    lite("Other Game", "KC", "DEN", "REC_YDS", "OVER", 0.7),
  ];
  const pairs = suggestPairs(legs, rows);
  assert.deepEqual(pairs.map((p) => p.row.player), ["Khalil Shakir"]);
  assert.equal(pairs[0].with, "Josh Allen");
  assert.equal(suggestPairs([], rows).length, 0);
});

const slip = (legs: [string, "OVER" | "UNDER", "hit" | "miss"][]): SavedSlip => ({
  id: "s", createdAt: "", entry: 10, multiplier: 3,
  legs: legs.map(([stat, side, result], i) => ({ propId: `${i}`, player: "P", stat: stat as never, line: 5.5, side, prob: 0.55, result, sport: "NBA" })),
});

test("hotSpots finds what you hit and what you don't", () => {
  const legs: [string, "OVER" | "UNDER", "hit" | "miss"][] = [
    ...Array.from({ length: 7 }, () => ["REB", "UNDER", "hit"] as [string, "UNDER", "hit"]),
    ["REB", "UNDER", "miss"], ["REB", "UNDER", "miss"],
    ...Array.from({ length: 6 }, () => ["PTS", "OVER", "miss"] as [string, "OVER", "miss"]),
    ["PTS", "OVER", "hit"], ["PTS", "OVER", "hit"],
    ["AST", "OVER", "hit"],
  ];
  const { hot, cold } = hotSpots([slip(legs)]);
  assert.equal(hot.length, 1);
  assert.equal(hot[0].label, "NBA rebound unders");
  assert.equal(hot[0].n, 9);
  assert.equal(cold[0].label, "NBA point overs");
  const rows = [lite("A", "BOS", "NYK", "REB", "UNDER", 0.58, "NBA"), lite("B", "BOS", "NYK", "REB", "OVER", 0.6, "NBA"), lite("C", "BOS", "NYK", "REB", "UNDER", 0.51, "NBA")];
  assert.deepEqual(spotLines(rows, hot).map((x) => x.row.player), ["A"]);
});

test("crowd counts and disagreements", () => {
  const k = crowdKey("Jayson Tatum", "PTS", 27.5);
  const counts = crowdCounts({ [`${k}|OVER`]: 8, [`${k}|UNDER`]: 2, [`${crowdKey("A", "PTS", 1.5)}|OVER`]: 2 });
  assert.deepEqual(counts[k], { over: 8, under: 2 });
  assert.equal(crowdLean(counts[crowdKey("A", "PTS", 1.5)]), null);
  assert.equal(crowdLean(counts[k])!.share, 0.8);
  const rows = [
    { player: "Jayson Tatum", stat: "PTS", line: 27.5, pick: "UNDER" as const, pickProb: 0.58 },
    { player: "jayson tatum", stat: "PTS", line: 27.5, pick: "OVER" as const, pickProb: 0.58 },
  ];
  assert.equal(disagreements(rows, counts).length, 1);
});
