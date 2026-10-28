import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNflContext, nflAdjust, nflSeason, nflSlice, parseCsv } from "./nflverse.ts";
import type { Prop } from "./types.ts";

const HEAD = "player_display_name,position,season_type,game_id,week,team,opponent_team,attempts,sacks_suffered,passing_epa,carries,rushing_epa,receptions,receiving_yards,target_share";
const row = (name: string, pos: string, week: number, team: string, opp: string, f: Partial<Record<string, number>> = {}) =>
  [name, pos, "REG", `2026_${week}_${team}_${opp}`, week, team, opp, f.att ?? 0, f.sacks ?? 0, f.pepa ?? 0, f.car ?? 0, f.repa ?? 0, f.rec ?? 0, f.ry ?? 0, f.tgt ?? 0].join(",");

test("csv parser handles quotes and CRLF", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n'), [{ a: "x, y", b: 'say "hi"' }]);
});

test("context: target-share trends, position matchups and EPA by defense", () => {
  const lines = [HEAD];
  for (let w = 1; w <= 6; w++) {
    // A tight end whose role grows in the last three weeks.
    lines.push(row("Tight End", "TE", w, "KC", w % 2 ? "BUF" : "DEN", { rec: 5, ry: 50, tgt: w > 3 ? 0.3 : 0.15 }));
    lines.push(row("Quarter Back", "QB", w, "KC", w % 2 ? "BUF" : "DEN", { att: 35, sacks: 2, pepa: w % 2 ? 9 : -3 }));
    // A defensive namesake shouldn't overwrite anyone.
    lines.push(row("Tight End", "LB", w, "DEN", "KC"));
  }
  const ctx = buildNflContext(parseCsv(lines.join("\n")), [], 2026);
  const te = ctx.players["tight end"];
  assert.equal(te.pos, "TE");
  assert.equal(te.tgtRecent, 0.3);
  assert.ok(te.tgtSeason! > 0.2 && te.tgtSeason! < 0.24);
  // BUF gave up 9 EPA on 37 dropbacks a game; DEN -3.
  assert.ok(ctx.defense.BUF.passEpa > ctx.league.passEpa && ctx.defense.DEN.passEpa < ctx.league.passEpa);

  const prop: Prop = { id: "p", sport: "NFL", player: "Tight End", team: "KC", opponent: "BUF", stat: "REC_YDS", line: 49.5 };
  const adj = nflAdjust(prop, nflSlice(ctx, prop.player, "BUF"));
  assert.ok(adj.factor > 1);
  assert.ok(adj.reasons.some((r) => r.startsWith("Target share 30%")));
  const td = nflAdjust({ ...prop, player: "Quarter Back", stat: "PASS_TD", line: 1.5 }, nflSlice(ctx, "Quarter Back", "BUF"));
  assert.equal(td.replacesDefense, true);
  assert.ok(td.factor > 1);
  assert.match(td.reasons[0], /EPA per dropback \(1st-most\)/);
});

test("season rolls over in August", () => {
  assert.equal(nflSeason(new Date("2026-10-28")), 2026);
  assert.equal(nflSeason(new Date("2027-01-20")), 2026);
  assert.equal(nflSeason(new Date("2027-08-15")), 2027);
});
