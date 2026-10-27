# LegUp

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
  To save Odds API credits, only the most-played stats are fetched (NBA points, rebounds, assists,
  threes and PRA, for example), only for games that haven't started, and each game's lines are cached
  for everyone for six hours. Fetching pauses before the monthly credits run out.
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

## Accounts (`lib/accounts.ts`, `components/Account.tsx`)

Sign-in is handled by [Clerk](https://clerk.com): Google, Apple or an email code, no passwords to store.
An account keeps the user's Pro key and saved slips (`account:{userId}`, `slips:user:{userId}`), so both
follow them to any device. With accounts on, buying Pro or redeeming a lifetime code needs sign-in, and a
Pro key bought earlier on a device is linked to the account the first time that device signs in.

Turn it on by adding Clerk from the Vercel Marketplace (it sets `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY`), then pick sign-in methods in Clerk's dashboard. Without those keys the site runs
signed out with Pro keys and sync codes, exactly as before.

**Leaderboard** (`/leaderboard`, `lib/leaderboard.ts`): signed-in users pick a username to join. It ranks by
hit rate once someone has 10 counted picks. Only picks graded from box scores and saved before their game
started count, so hand-marked wins don't. The board is rebuilt at most every 10 minutes.

**Admin** (`/admin`, `lib/admin.ts`): accounts whose verified email is in `ADMIN_EMAILS` get an Admin tab.
It shows every lifetime code and whether it's been used, makes new codes (stored in the database, so they
work without a redeploy), revokes a used code's Pro, and shows Pro member counts and Odds API credits left.

## Pro (`lib/pro.ts`)

Pro unlocks auto-filled lines, the best-slip builder, tracker insights, CSV export and the report card. There are no accounts: paying (Stripe Checkout)
or redeeming a lifetime code gives the browser a Pro key like `LEG-ABCD-EFGH-JKLM`, which works on
any device it's typed into on `/pro`. Subscription keys are re-checked with Stripe every few hours,
so a cancelled plan stops working at the end of its period. Nothing is locked until
`STRIPE_SECRET_KEY` or `LIFETIME_CODES` is set.

Setting it up:

1. In Stripe, create a product "LegUp Pro" with a monthly and a yearly recurring price. Copy
   each price ID (`price_...`) into `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY`.
2. Copy the secret key into `STRIPE_SECRET_KEY` and set the two `NEXT_PUBLIC_PRO_*_LABEL`s.
3. Turn on the customer portal (Settings → Billing → Customer portal) so subscribers can cancel.
4. The database (Upstash) is required: it's where Pro keys and used codes are kept.
5. For free lifetime passes, put codes in `LIFETIME_CODES`, comma separated, or make them on `/admin`. Each works once.

## Next up

- NHL and MLB team defense (both use recent form only for now)
- Accounts instead of sync codes
