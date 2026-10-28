import { test } from "node:test";
import assert from "node:assert/strict";
import { defenseFactors, nhlAllowed, parseScoreboard, type EspnGame } from "./espn.ts";
import { project } from "./model.ts";
import type { GameLog, NewsItem, Prop } from "./types.ts";

const game = (a: string, b: string, aStats: Record<string, number>, bStats: Record<string, number>): EspnGame => ({
  id: `${a}${b}`,
  date: "2026-10-25T23:00Z",
  state: "post",
  seasonType: 2,
  teams: [
    { abbr: a, stats: aStats },
    { abbr: b, stats: bStats },
  ],
});

test("shots against are the team's saves plus goals allowed; 'saves' is shots taken", () => {
  const [chi, fla] = nhlAllowed([game("CHI", "FLA", { saves: 31, goals: 2, assists: 4 }, { saves: 19, goals: 3, assists: 5 })]);
  assert.deepEqual(chi, { team: "CHI", allowed: { shots: 34, goals: 3, assists: 5, saves: 21 } });
  assert.deepEqual(fla.allowed.shots, 21);
});

test("NHL defense factors cover shots, goals and saves", () => {
  const games = [
    game("CHI", "FLA", { saves: 31, goals: 2, assists: 4 }, { saves: 19, goals: 3, assists: 5 }),
    game("BOS", "TOR", { saves: 25, goals: 4, assists: 7 }, { saves: 28, goals: 1, assists: 2 }),
  ];
  const f = defenseFactors("NHL", nhlAllowed(games), 0);
  // CHI allowed 34 shots vs a league average of 27.5.
  assert.ok(f.CHI.SOG! > 1.2);
  assert.ok(f.FLA.SOG! < 1);
  assert.ok("SAVES" in f.CHI && "GOALS" in f.CHI && "NHL_PTS" in f.CHI);
});

test("scoreboard reads the probable starting goalie and whether it's confirmed", () => {
  const json = {
    events: [
      {
        id: "1",
        date: "2026-10-28T23:00Z",
        competitions: [
          {
            status: { type: { state: "pre" } },
            competitors: [
              { homeAway: "home", team: { abbreviation: "CHI" }, probables: [{ name: "probableStartingGoalie", athlete: { displayName: "Spencer Knight" }, status: { type: "confirmed" } }] },
              { homeAway: "away", team: { abbreviation: "FLA" }, probables: [{ name: "probableStartingGoalie", athlete: { displayName: "Akira Schmid" }, status: { type: "probable" } }] },
            ],
          },
        ],
      },
    ],
  };
  const [g] = parseScoreboard(json, "NHL");
  assert.deepEqual(g.teams[0].goalie, { name: "Spencer Knight", confirmed: true });
  assert.deepEqual(g.teams[1].goalie, { name: "Akira Schmid", confirmed: false });
});

test("a saves prop on a goalie who isn't starting is flagged", () => {
  const logs: GameLog[] = Array.from({ length: 12 }, (_, i) => ({ date: `2026-10-${10 + i}`, opponent: "FLA", playing: 60, stats: { saves: 26 + (i % 5) } }));
  const prop: Prop = { id: "g", sport: "NHL", player: "Petr Mrazek", team: "CHI", opponent: "FLA", stat: "SAVES", line: 26.5 };
  const news = (confirmed: boolean): NewsItem[] => [
    { id: "n", date: "", player: "Spencer Knight", team: "CHI", kind: "starting_goalie", confirmed, headline: "" },
  ];
  const confirmed = project({ prop, logs, defense: {}, news: news(true) });
  assert.equal(confirmed.status, "out");
  assert.match(confirmed.reasons[1], /Spencer Knight is the confirmed starter/);
  const probable = project({ prop, logs, defense: {}, news: news(false) });
  assert.equal(probable.status, "ok");
  assert.equal(probable.confidence, "low");
  const starter = project({ prop: { ...prop, player: "Spencer Knight" }, logs, defense: {}, news: news(true) });
  assert.ok(starter.reasons.includes("Confirmed starting goalie"));
});
