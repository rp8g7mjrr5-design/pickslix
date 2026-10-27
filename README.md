# PickSlix

Tracks DraftKings Pick 6 over/under player props for NBA and NFL and estimates
the chance each one hits, using recent games, the opponent matchup, and injury news.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # model tests
```

Out of the box it pulls live NBA and NFL stats and injuries from ESPN's public feeds
(no key needed). Paste the day's Pick 6 lines into the box on the board and it looks up
each player, their next opponent, and scores the line. Set `DATA_SOURCE=sample` to see the
demo board with made-up lines instead.

## Adding lines

- **Pick from games (easiest):** the top of the board lists upcoming NBA, NFL, NHL and MLB games.
  Tap one, choose a player and stat, and tap More or Less. With `ODDS_API_KEY` set the line starts at
  Pick 6's posted line (or the sportsbook median when Pick 6 hasn't posted it); otherwise at the
  season average. Odds update live as the line moves.
- **Screenshot:** upload, drop or paste a screenshot of the Pick 6 board or of an entry you made.
  Picks with More/Less chosen load straight into the slip. Without a key it's read on the device
  with Tesseract.js (free; the engine downloads from jsDelivr the first time). Set
  `ANTHROPIC_API_KEY` to read screenshots with Claude instead, which handles busy screenshots
  much better.
- **Paste text:** one prop per line or text copied from the app (`lib/parseLines.ts`).
- **Type one:** player, stat and line.

## Deploy on Vercel (Hobby, free)

1. Import the GitHub repo at vercel.com/new. No settings needed; it deploys as a Next.js app.
2. Optional but recommended, for slips that sync across devices and faster loads:
   in the project go to **Storage → Marketplace → Upstash (Redis)**, create the free
   database, and connect it to the project. That adds `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` for you. Redeploy.
3. Optional: add a `CRON_SECRET` env var (any long random string) so only Vercel's cron can
   hit the refresh endpoint.

`vercel.json` schedules `/api/cron/refresh` once a day at 13:00 UTC (Hobby allows one run a day).
It rebuilds team defense numbers from the season's box scores and saves them to Redis. Without
Redis the app still works: it computes a lighter version on the first request and caches it.

## Where the data comes from (`lib/espn.ts`)

| What | ESPN feed | Notes |
| --- | --- | --- |
| Player lookup | `site.web.api.espn.com/apis/common/v3/search` | Exact name match first, team as a tiebreaker |
| Game logs | `.../athletes/{id}/gamelog` | Regular season and playoffs; tops up with last season early in the year |
| Injuries | `site.api.espn.com/.../injuries` | Out / IR / suspended → "ruled out"; questionable, doubtful, day-to-day → "questionable" |
| Upcoming games | `.../scoreboard` | Next three days (NBA), rest of this week plus next week (NFL) |
| Team players | `.../teams/{id}/athletes/statistics` | Season per-game averages, most minutes first; roster as a fallback |
| Next opponent | `.../scoreboard` | Today through two days out (NBA), this week and next (NFL) |
| Team defense | NBA scoreboards, NFL game summaries | What each team allows vs league average, shrunk toward average by games played |

These feeds are unofficial and can change without notice; parsers skip fields they don't find
rather than crash, and `npm test` checks them against saved real responses in `lib/fixtures/`.

Known gaps: NFL logs have no snap counts, so minutes-limit news doesn't apply there; NFL
passing TD defense isn't computed; teammate-out usage bumps still need a manual news item.

## How the probability works (`lib/model.ts`)

1. Take the player's last 25 games and weight recent ones more (half-life of
   6 games in NBA, 4 in NFL).
2. Adjust for the opponent: how much they allow of that stat vs league average,
   shrunk 40% toward average so one noisy number can't swing it.
3. Apply news: teammate out (usage bump), minutes limit (scale down), key
   defender out, questionable (lower confidence), ruled out (flag as void).
4. Pull the projection 30% toward the posted line, since the line already
   prices in information the model doesn't see.
5. Fit a negative binomial (or Poisson) to that mean and spread and read off
   P(over), P(under), P(push).

The slip multiplies leg probabilities, which assumes legs are independent.
Picks from the same game are usually correlated, so treat that number as rough.

## Layout

- `app/` pages and the `/api/props` route
- `components/` board, slip, and tracker UI
- `lib/model.ts` probability model, `lib/providers.ts` data sources,
  `lib/sampleData.ts` sample lines/stats/news
- `lib/espn.ts` ESPN feeds, `lib/parseLines.ts` Pick 6 paste parser,
  `lib/refresh.ts` defense snapshot + cron job, `lib/db.ts` Redis client
- Pasted lines live in the browser. Saved slips live in the browser and, when Redis is
  connected, sync under a code shown on the Tracker page (enter it on another device).

## Tracker

Saved picks grade themselves: after each game the tracker looks up the player's box score and marks
hit, miss or push (a player who doesn't play counts as a push). Tap a result to override. The
model report card buckets graded picks by the model's chance so you can see whether 60% picks
really hit about 60% of the time. `/setup` shows which optional keys the deployment has.

## Next up

- NHL and MLB team defense (both use recent form only for now)
- Accounts instead of sync codes
