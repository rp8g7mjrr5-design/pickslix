import { test } from "node:test";
import assert from "node:assert/strict";
import { correlatedHitProbability, statCorrelation } from "./correlation.ts";
import { project } from "./model.ts";
import { statFromText } from "./parseLines.ts";
import { fightLogs, fighterTag, finishChance, parseFighterStats, parseFights, perMinute, ufcBase } from "./ufc.ts";
import type { GameLog, Prop } from "./types.ts";

const scoreboard = {
  events: [
    {
      date: "2026-04-04T21:00Z",
      competitions: [
        {
          id: "900",
          date: "2026-04-05T03:00Z",
          format: { regulation: { periods: 5 } },
          status: { period: 2, clock: 194, type: { state: "post" } },
          competitors: [
            { id: "1", winner: true, athlete: { displayName: "Renato Moicano" }, records: [{ summary: "21-7-1" }] },
            { id: "2", winner: false, athlete: { displayName: "Chris Duncan" } },
          ],
        },
        {
          id: "901",
          format: { regulation: { periods: 3 } },
          status: { period: 0, clock: 0, type: { state: "pre" } },
          competitors: [{ id: "3", athlete: { displayName: "A B" } }, { id: "4", athlete: { displayName: "C D" } }],
        },
      ],
    },
  ],
};

const stats = {
  categories: [
    { labels: ["TSL", "SSL", "SSA", "KD"], statistics: [{ uid: "s:3301~l:3321~e:600058693~c:900", stats: ["62", "21", "36", "0"] }] },
    { labels: ["SCBL\t", "TDL", "TDA"], statistics: [{ uid: "s:3301~l:3321~e:600058693~c:900", stats: ["1", "1", "4"] }] },
  ],
};

test("fights read the scheduled rounds and the time actually fought", () => {
  const [done, next] = parseFights(scoreboard);
  assert.equal(done.rounds, 5);
  assert.ok(Math.abs(done.minutes! - (5 + 194 / 60)) < 1e-9);
  assert.deepEqual(done.fighters[0], { id: "1", name: "Renato Moicano", winner: true, record: "21-7-1" });
  assert.equal(next.state, "pre");
  assert.equal(next.minutes, undefined);
  assert.equal(next.date, "2026-04-04T21:00Z");
});

test("a fighter's per-fight stats join the fight they came from", () => {
  const s = parseFighterStats(stats);
  assert.deepEqual(s.get("900"), { sigStr: 21, sigAtt: 36, td: 1, tdAtt: 4, kd: 0 });
  const logs = fightLogs("1", s, new Map(parseFights(scoreboard).map((f) => [f.id, f])));
  assert.equal(logs.length, 1);
  assert.equal(logs[0].opponent, "Duncan");
  assert.equal(logs[0].date, "2026-04-05");
  assert.equal(logs[0].playing, 8.23);
  assert.equal(logs[0].stats.rounds, 5);
  assert.equal(fighterTag("Renato Moicano"), "Moicano");
  assert.equal(fighterTag("Gilbert Burns Jr"), "Burns Jr");
});

const fight = (minutes: number, sigStr: number, rounds = 3, td = 0): GameLog => ({
  date: "2026-01-01",
  opponent: "X",
  playing: minutes,
  stats: { sigStr, td, rounds },
});

test("landing rate is per minute, so quick finishes don't drag it down", () => {
  // 60 strikes in 15 minutes and 8 in 2: both 4 a minute or so.
  assert.ok(Math.abs(perMinute([fight(15, 60), fight(2, 8)], "sigStr") - 4) < 1e-9);
});

test("finish chance comes from both fighters' records, shrunk toward the UFC norm", () => {
  const decisions = [fight(15, 50), fight(15, 50), fight(15, 50), fight(15, 50)];
  const finishes = [fight(3, 10), fight(4, 10), fight(2, 10), fight(6, 10)];
  assert.ok(finishChance(decisions, decisions) < 0.2);
  assert.ok(finishChance(finishes, finishes) > 0.75);
  assert.equal(finishChance([], []), 0.45);
});

test("expected count is rate times expected fight length; a likely finish lowers it and widens the spread", () => {
  const steady = [fight(15, 60), fight(15, 60), fight(15, 60), fight(15, 60)];
  const long = ufcBase("sigStr", steady, { rounds: 3, opponent: steady });
  const short = ufcBase("sigStr", steady, { rounds: 3, opponent: [fight(1, 2), fight(2, 2), fight(1, 2), fight(3, 2)] });
  assert.ok(long.mean > short.mean);
  assert.ok(long.mean <= 60);
  const five = ufcBase("sigStr", steady, { rounds: 5, opponent: steady });
  assert.ok(five.mean > long.mean * 1.5);
  assert.ok(short.variance / short.mean > long.variance / long.mean);
});

test("UFC props project through the fight model", () => {
  const prop: Prop = { id: "u", sport: "UFC", player: "Renato Moicano", team: "Moicano", opponent: "Nolan", stat: "SIG_STR", line: 40.5 };
  const logs = [fight(15, 60), fight(15, 45), fight(10, 30), fight(15, 50)];
  const p = project({ prop, logs, defense: {}, news: [], ufc: { rounds: 3, opponent: logs } });
  assert.ok(p.reasons[0].startsWith("Lands"));
  assert.ok(p.reasons[1].startsWith("3-round fight"));
  assert.ok(p.mean > 0 && p.pOver > 0 && p.pOver < 1);
});

test("Pick 6 wording for fight stats", () => {
  assert.equal(statFromText("Significant Strikes"), "SIG_STR");
  assert.equal(statFromText("Sig. Strikes"), "SIG_STR");
  assert.equal(statFromText("Takedowns"), "TD");
  assert.equal(statFromText("Pitcher Strikeouts"), "K");
});

test("strikes on both sides of one fight move together", () => {
  const a = { player: "Renato Moicano", stat: "SIG_STR" as const, side: "OVER" as const, prob: 0.5, sport: "UFC" as const, team: "Moicano", opponent: "Nolan" };
  const b = { ...a, player: "Other Nolan", team: "Nolan", opponent: "Moicano" };
  assert.equal(statCorrelation(a, b), 0.3);
  assert.equal(statCorrelation(a, { ...b, team: "Someone", opponent: "Else" }), 0);
  const r = correlatedHitProbability([a, b]);
  assert.ok(r.prob > r.independent);
});
