import { test } from "node:test";
import assert from "node:assert/strict";
import { matchEvent, parseEventLines, sameTeam } from "./odds.ts";

const outcome = (name: string, description: string, point: number) => ({ name, description, point, price: -110 });

test("Pick 6 lines win; otherwise the sportsbook median stands in", () => {
  const lines = parseEventLines(
    {
      bookmakers: [
        {
          key: "draftkings",
          markets: [
            { key: "player_points", outcomes: [outcome("Over", "Jayson Tatum", 27.5), outcome("Under", "Jayson Tatum", 27.5)] },
            { key: "player_rebounds", outcomes: [outcome("Over", "Jayson Tatum", 8.5)] },
          ],
        },
        { key: "fanduel", markets: [{ key: "player_rebounds", outcomes: [outcome("Over", "Jayson Tatum", 7.5)] }] },
        { key: "betmgm", markets: [{ key: "player_rebounds", outcomes: [outcome("Over", "Jayson Tatum", 8.5)] }] },
        { key: "pick6", markets: [{ key: "player_points", outcomes: [outcome("Over", "Jayson Tatum", 26.5)] }] },
        { key: "pick6", markets: [{ key: "player_blocks", outcomes: [outcome("Over", "Jayson Tatum", 0.5)] }] },
      ],
    },
    "NBA",
  );
  assert.deepEqual(lines["jayson tatum"], {
    PTS: { line: 26.5, book: "Pick 6" },
    REB: { line: 8.5, book: "DraftKings" },
  });
});

test("hockey markets map onto hockey stats", () => {
  const lines = parseEventLines(
    { bookmakers: [{ key: "pick6", markets: [{ key: "player_shots_on_goal", outcomes: [outcome("Over", "Connor McDavid", 3.5)] }] }] },
    "NHL",
  );
  assert.deepEqual(lines["connor mcdavid"], { SOG: { line: 3.5, book: "Pick 6" } });
});

test("events match ESPN short team names and the nearest start time", () => {
  assert.ok(sameTeam("Los Angeles Clippers", "Clippers"));
  assert.ok(sameTeam("Boston Red Sox", "Red Sox"));
  assert.ok(!sameTeam("Chicago White Sox", "Red Sox"));
  const events = [
    { id: "a", commence_time: "2026-10-27T23:30:00Z", home_team: "Boston Celtics", away_team: "Brooklyn Nets" },
    { id: "b", commence_time: "2026-11-20T23:30:00Z", home_team: "Boston Celtics", away_team: "Brooklyn Nets" },
    { id: "c", commence_time: "2026-10-27T23:30:00Z", home_team: "Brooklyn Nets", away_team: "Boston Celtics" },
  ];
  assert.equal(matchEvent(events, "Celtics", "Nets", "2026-10-27T23:30Z")?.id, "a");
  assert.equal(matchEvent(events, "Knicks", "Nets", "2026-10-27T23:30Z"), undefined);
});
