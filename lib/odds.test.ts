import { test } from "node:test";
import assert from "node:assert/strict";
import { marketPrice, matchEvent, parseEventLines, sameTeam, withOpeners } from "./odds.ts";

const outcome = (name: string, description: string, point: number, price = -110) => ({ name, description, point, price });

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
    // DraftKings priced both sides of points, so its no-vig price rides along.
    PTS: {
      line: 26.5,
      book: "Pick 6",
      posted: { pick6: 26.5 },
      market: { line: 27.5, pOver: 0.5, books: 1, sharp: false },
      best: { over: { book: "DraftKings", price: -110 }, under: { book: "DraftKings", price: -110 } },
    },
    REB: { line: 8.5, book: "DraftKings" },
  });
});

test("hockey markets map onto hockey stats", () => {
  const lines = parseEventLines(
    { bookmakers: [{ key: "pick6", markets: [{ key: "player_shots_on_goal", outcomes: [outcome("Over", "Connor McDavid", 3.5)] }] }] },
    "NHL",
  );
  assert.deepEqual(lines["connor mcdavid"], { SOG: { line: 3.5, book: "Pick 6", posted: { pick6: 3.5 } } });
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

test("spends no credits on started games or when credits are nearly gone", async () => {
  const { fetchGameLines } = await import("./odds.ts");
  const { kvSet } = await import("./db.ts");
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  const future = new Date(Date.now() + 3 * 3600_000).toISOString();
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    const events = [{ id: "e1", commence_time: future, home_team: "Boston Celtics", away_team: "Brooklyn Nets" }];
    return new Response(JSON.stringify(events), { status: 200 });
  }) as typeof fetch;
  try {
    assert.deepEqual(await fetchGameLines("NBA", "Celtics", "Nets", new Date(Date.now() - 60_000).toISOString()), {});
    assert.equal(calls.length, 0);
    await kvSet("odds:remaining", { remaining: 6, at: new Date().toISOString() });
    assert.deepEqual(await fetchGameLines("NBA", "Celtics", "Nets", future), {});
    // Only the free events list was asked for; the odds call (5 credits) was skipped.
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/events\?/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("market price de-vigs each book at the most-dealt point, sharp books counting double", () => {
  const m = marketPrice([
    { book: "draftkings", point: 24.5, over: -130, under: 100 },
    { book: "fanduel", point: 24.5, over: -120, under: -110 },
    { book: "pinnacle", point: 24.5, over: -140, under: 115 },
    { book: "betmgm", point: 23.5, over: -110, under: -110 },
    // No prices on pick'em apps, and one-sided quotes can't be de-vigged.
    { book: "pick6", point: 22.5, over: -110, under: -110 },
    { book: "caesars", point: 24.5, over: -125 },
  ]);
  assert.ok(m);
  assert.equal(m.line, 24.5);
  assert.equal(m.books, 3);
  assert.equal(m.sharp, true);
  // Every book leans over: DraftKings 53%, FanDuel 51%, Pinnacle 56% (twice) average to about 54%.
  assert.ok(m.pOver > 0.53 && m.pOver < 0.55, String(m.pOver));
  assert.equal(marketPrice([{ book: "draftkings", point: 3.5, over: -110 }]), undefined);
});

test("parser keeps both sides' prices from each book", () => {
  const lines = parseEventLines(
    {
      bookmakers: [
        { key: "pick6", markets: [{ key: "player_points", outcomes: [outcome("Over", "Luka Doncic", 30.5)] }] },
        {
          key: "pinnacle",
          markets: [{ key: "player_points", outcomes: [outcome("Over", "Luka Doncic", 32.5, -105), outcome("Under", "Luka Doncic", 32.5, -115)] }],
        },
      ],
    },
    "NBA",
  );
  const pts = lines["luka doncic"].PTS!;
  assert.equal(pts.line, 30.5);
  assert.equal(pts.market?.line, 32.5);
  assert.equal(pts.market?.sharp, true);
  // -105 over / -115 under: the under is the slight favorite.
  assert.ok(pts.market!.pOver > 0.48 && pts.market!.pOver < 0.5, String(pts.market!.pOver));
});

test("openers are kept and moved lines are marked", () => {
  const first = withOpeners({ "a b": { PTS: { line: 20.5, book: "Pick 6" } } }, {});
  assert.deepEqual(first.openers, { "a b|PTS": 20.5 });
  assert.equal(first.lines["a b"].PTS!.open, undefined);
  const later = withOpeners({ "a b": { PTS: { line: 22.5, book: "Pick 6" } } }, first.openers);
  assert.equal(later.lines["a b"].PTS!.open, 20.5);
  assert.equal(later.openers["a b|PTS"], 20.5);
});
