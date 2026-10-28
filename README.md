# LayLock

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

- **Pick from games (easiest):** the top of the board lists upcoming NBA, NFL, NHL, MLB, college football (CFB) and men's college basketball (CBB) games, plus the next UFC card.
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

Known gaps: minutes-limit news doesn't apply to NFL (snap counts come from nflverse, not the game logs);
teammate-out usage bumps still need a manual news item.

## How the probability works (`lib/model.ts`)

1. Take the player's last 25 games and weight recent ones more (half-life of
   6 games in NBA, 4 in NFL).
2. Adjust for the opponent: how much they allow of that stat vs league average,
   shrunk 40% toward average so one noisy number can't swing it.
3. Apply the game environment (spread and total, below), then news: teammate out (usage bump), minutes limit (scale down), key
   defender out, questionable (lower confidence), ruled out (flag as void).
4. Pull the projection toward the market. When sportsbooks have priced the prop (both sides, with odds),
   their prices are de-vigged into a no-vig chance, Pinnacle and BetOnline counting double, and turned into
   the mean that price implies; the projection goes halfway there. Without a priced market it's pulled 30%
   toward the posted line instead, since the line already prices in information the model doesn't see.
5. Fit a negative binomial (or Poisson) to that mean and spread and read off
   P(over), P(under), P(push).

The slip's chance allows for picks that move together (`lib/correlation.ts`): a QB and his receiver, one
player's points and PRA, two skaters on the same team, a pitcher's hits allowed and the hitters facing him.
Each linked pair gets an estimated correlation (flipped when one leg is an under), and the slip is simulated
with a Gaussian copula; unrelated legs still just multiply. The slip says which picks are linked and whether
that helps or hurts. The correlations are rough estimates, not yet fitted to graded picks.

## Layout

- `app/` pages and the `/api/props` route
- `components/` board, slip, and tracker UI
- `lib/model.ts` probability model, `lib/providers.ts` data sources,
  `lib/sampleData.ts` sample lines/stats/news
- `lib/espn.ts` ESPN feeds, `lib/parseLines.ts` Pick 6 paste parser,
  `lib/refresh.ts` defense snapshot + cron job, `lib/db.ts` Redis client
- Pasted lines live in the browser. Saved slips live in the browser and, when Redis is
  connected, sync under a code shown on the Tracker page (enter it on another device).

## Market check and line movement (`lib/odds.ts`)

The same Odds API call that finds Pick 6's line also returns the sportsbooks' prices, so the market read costs
no extra credits (Pinnacle and BetOnline are in the bookmaker list; up to 10 books cost the same as one region).
The pick card shows the books' no-vig chance next to the model's, says when Pick 6's line sits off the books'
(books at 27.5 and Pick 6 at 25.5 makes More the easier side), and shows how far the line has moved since we
first saw it (openers are kept for five days under `odds:open:{eventId}`). This is the props version of
"public vs sharp money": betting splits only exist for game lines, and the sharp books' price is the signal
that matters for a player prop.

Pasted and screenshot lines get the same market read (`lib/gameContext.ts`): each line is matched to its game,
and the game's cached prop prices are used. Lines nobody has opened yet are fetched only for Pro, as on the
game picker.

## Game environment (`lib/environment.ts`)

Spreads and totals for a sport's whole slate come from one Odds API call (two credits, cached six hours and
shared by everyone, so it isn't a Pro feature). From them each team gets an implied total, measured against the
slate's average game total (or a typical total when fewer than four games are priced). The model scales each
stat by that, with modest weights: scoring stats follow the team's implied total, rebounds follow the game total,
and goalie saves and pitcher stats follow what the opponent is expected to score. NBA starters lose up to 6% when
the spread is 10 or more (blowout risk), and in the NFL underdogs lean toward passing and favorites toward running,
up to 6%. The total swing is capped at 15%.

## NFL depth (`lib/nflverse.ts`, `lib/nflData.ts`)

[nflverse](https://github.com/nflverse/nflverse-data) publishes free weekly player stats and snap counts as CSVs
on GitHub. The daily cron (or the first request after 36 hours) downloads this season's files (about 4 MB), boils
them down to a ~200 KB summary and saves it. From it the model gets:

- **Role trends:** target share (catches, receiving yards) and carry share (rushing) over the last 3 games vs
  the season; 40% of the change carries into the projection. Snap-share swings of 10 points or more are noted.
- **Matchups by position:** receptions and receiving yards each defense allows to WRs, TEs and RBs, which
  replaces the team-wide number for those stats.
- **EPA allowed:** per dropback and per carry, ranked across the league. It drives passing TDs (which had no
  defense number before) and is shown as context for the other passing and rushing props.

If nflverse can't be reached the model runs without these, as before.

## NHL (`lib/espn.ts`)

- **Starting goalies:** ESPN's scoreboard lists each team's probable starting goalie, marked once the team
  confirms. A saves prop on a goalie who isn't the starter is flagged: low confidence while it's only probable,
  and treated like a scratch (likely voided) once the other goalie is confirmed. The starter gets a note too.
- **Team defense:** shots on goal, goals and assists each team allows, and the shots each team takes (which is
  what the opposing goalie's saves depend on), from the last 20 to 45 days of scoreboards, shrunk toward league
  average. Built daily with NBA and NFL defense.

## NBA teammates out (`lib/usage.ts`, `lib/usageData.ts`)

When ESPN's injury report rules out a rotation player (top 8 by minutes, at least two games this season), each
teammate's projection gets a bump for the shots, rebounds and assists left behind. Two reads, blended:

- **With/without:** the player's own averages this season in games the teammate missed vs games they played.
- **Share left behind:** the teammate's share of the team's production for that stat, about a third of it picked
  up by the rest of the team in proportion. This carries the number until there are games without the teammate;
  with/without counts equally after six of them.

Each teammate's bump is capped at +20% (and −15%), all of them together at +35%. Players who have already been
out for this player's last five games are skipped, since the recent average already reflects it. The pasted
board and the game picker both use it; the sportsbooks' price, when there is one, still pulls the final number.

## College (CFB and CBB)

FBS football and Division I men's basketball come from the same ESPN feeds as the pros (game logs, schedules,
team stats, injuries) and use the NFL and NBA stat menus. A pasted line reads as NFL or NBA from its stat; a
player ESPN doesn't find there is looked up in college next. What's different:

- Team defense comes from daily college basketball scoreboards and recent FBS box scores, stored under keys like
  `CBB:DUKE` so it never mixes with a pro team's abbreviation (MIA, HOU...).
- Spreads, totals and prop prices come from The Odds API's NCAAF and NCAAB feeds when the key is set; books post
  fewer college props, so only passing, rushing and receiving yards and points, rebounds and assists are fetched.
- College basketball blowouts need a bigger spread (15) before starters' minutes are trimmed; football's
  game-script lean is the NFL's.
- No teammate-out bumps or nflverse depth, which are pro-only.

## UFC (`lib/ufc.ts`, `lib/ufcData.ts`)

Significant strikes and takedowns. A fighter's count is how fast they land times how long the fight lasts, so
the projection is built that way instead of averaging fights that ran different lengths:

- **Landing rate:** strikes or takedowns per minute over their last ten UFC fights, recent ones weighted more.
- **Fight length:** 3 or 5 scheduled rounds. The chance it ends early comes from how often both fighters' recent
  fights ended before the final bell, shrunk toward the UFC-wide rate (about 45%). An early finish is taken to
  land anywhere in the fight, which lowers the expected minutes and widens the spread.
- **Data:** ESPN's UFC scoreboards (a whole year per request: dates, scheduled rounds, the round and clock each
  fight ended) are boiled down to a fight index saved daily by the cron (`ufc:fights`); each fighter's stats page
  gives per-fight strikes and takedowns. The picker lists the next card, one fighter per side.
- **Opponent defense:** what the opponent absorbed per minute in their last six fights (read from those fights'
  other fighters' stats pages), shrunk toward the league rate (3.7 strikes, 0.125 takedowns a minute) and scaling
  the landing rate.
- **Not yet:** sportsbook prices (The Odds API has no fighter props).

## MLB matchups (`lib/mlb.ts`, `lib/mlbData.ts`)

Each piece is a multiplier on the player's average, shrunk toward league average by the sample behind it, and
listed in the reasons:

- **Opposing starter (hitters):** ESPN's probable starter and what hitters have done against them (AVG for
  hits, SLG for total bases, OBP+SLG for runs/RBI/H+R+RBI), applied to the ~65% of plate appearances a starter
  usually gets.
- **Platoon (hitters):** the hitter's own numbers against the starter's hand vs overall (switch hitters skipped).
- **Opposing lineup (pitchers):** strikeout rate for strikeouts, average for hits allowed, on-base for outs.
- **Park:** run, hit and home-run factors (rounded multi-year values in `PARKS`), measured against the mix the
  player's average already reflects (about half at their home park).
- **Weather:** Open-Meteo temperature at first pitch for open-air parks: warmer air adds a little to hits, more
  to runs and most to power, capped at ±8%. Wind speed is shown at 15 mph and up but not modeled (no direction).

Early in a season, last season's splits and team batting fill in at half weight. All of it comes from ESPN
except the weather; the matchup total is capped at −20%/+25%.

## Splits (`lib/splits.ts`)

How often the player cleared today's line in games like today's: last 5, this season, against this opponent
(last season included), home or road, and the second night of a back-to-back (NBA and NHL). A split that goes
the same way at least 75% of the time over 4+ games is ringed as a pattern. Splits are shown, not fed to the
model: the samples are small and the model already weights recent form.

## Tracker

Saved picks grade themselves: after each game the tracker looks up the player's box score and marks
hit, miss or push (a player who doesn't play counts as a push). Tap a result to override. The
model report card buckets graded picks by the model's chance so you can see whether 60% picks
really hit about 60% of the time. `/setup` shows which optional keys the deployment has.

**Public report card** (`/accuracy`, `lib/accuracy.ts`): every saved pick across all users, graded from box
scores, bucketed by the model's chance, with a Brier score and per-sport hit rates. Same counting rules as the
leaderboard, and a pick many people played counts once. Rebuilt at most hourly; linked from the footer.

**Closing-line check** (`lib/clv.ts`): a pick saves the sportsbooks' price it had when picked. Every fresh odds
fetch keeps the latest price per prop for its game day (`odds:close:{sport}:{date}`), and once the game starts the
tracker pulls the last one seen before it. Each pick shows how its chance moved, with a beat-the-close summary.

**Self-tuning** (`lib/calibration.ts`): the daily refresh fits a two-number recalibration per sport (how sure the
model should be, and any lean to overs or unders) to every graded pick, held at "no change" until a couple of hundred
picks back it. The board and picker apply it with a reason line, picks save the untuned chance so it never learns
from itself, and `/accuracy` shows what it's doing.

**Alerts** (`lib/alerts.ts`, `lib/alertsData.ts`, `public/sw.js`): phone notifications (Web Push) when a player
on an open pick is ruled out or questionable, or the books move the pick's chance 5+ points. People turn them on
from the profile or tracker; on iPhone the site has to be added to the Home Screen first. Setup:

1. Make keys with `npx web-push generate-vapid-keys` and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and
   `VAPID_PRIVATE_KEY` on Vercel (optionally `VAPID_SUBJECT`, a `mailto:` address). Redeploy.
2. On the GitHub repo add the secrets `SITE_URL` (your site's address) and `CRON_SECRET` (same as on Vercel).
   `.github/workflows/alerts.yml` then calls `/api/cron/alerts` every 15 minutes.

**Live sweat** (`lib/live.ts`, `/api/live`): while a game on an open pick is on, the tracker's "Live now" section
reads ESPN's in-game box score every 30 seconds (only while the page is visible) and shows the stat so far against
the line, the game clock and score, and a pace projection once 15% of the game is played. Overs past the line show
as cashed, unders past it as busted. Total bases and UFC aren't tracked live (the box score doesn't add them up).

**Pick of the day** (`lib/potd.ts`, `lib/potdData.ts`): once lines are up for today's games, the model scores them
and locks in its strongest clean pick for the day (8+ games of sample, no injury flag, not low confidence, and the
books not leaning the other way). It shows at the top of the Board with an Add to slip button, gets graded from
the box score after the game, and its record shows on the card. It uses lines already cached from people opening
games; if nobody has yet, it buys one game's lines once a day (a few Odds API credits). The alerts cron warms it,
and it's re-tried every 20 minutes until there's a pick.

**Share a slip** (`lib/share.ts`, `/s/{id}`): the slip and each saved slip have a Share button that makes a short
link (kept a week) with a link-preview image of the picks. Anyone opening it can tail the picks still open.

## Accounts (`lib/accounts.ts`, `components/Account.tsx`)

Sign-in is handled by [Clerk](https://clerk.com): Google, Apple or an email code, no passwords to store.
An account keeps the user's Pro key and saved slips (`account:{userId}`, `slips:user:{userId}`), so both
follow them to any device. With accounts on, buying Pro or redeeming a lifetime code needs sign-in, and a
Pro key bought earlier on a device is linked to the account the first time that device signs in.

Turn it on by adding Clerk from the Vercel Marketplace (it sets `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY`), then pick sign-in methods in Clerk's dashboard. Without those keys the site runs
signed out with Pro keys and sync codes, exactly as before.

**Username and profile:** a new account picks a username before anything else (live availability check). The
profile (`/profile`, from the avatar menu) shows record, hit rate against the model, slip profit, streaks, recent
form, splits by sport, prop and side, closing-line results, leaderboard rank and alert settings.

**Leaderboard** (`/leaderboard`, `lib/leaderboard.ts`): everyone with a username is on it unless they hide. It ranks by
hit rate once someone has 10 counted picks. Only picks graded from box scores and saved before their game
started count, so hand-marked wins don't. The board is rebuilt at most every 10 minutes.

**Crews** (`/crews`, `lib/crews.ts`): private groups joined with an invite link (`/join/{code}`). Members see a
crew leaderboard (same counting rules as the global one) and each other's slips from the last 7 days, without
entry amounts, and can tail a slip: its picks whose games haven't started are copied into their own slip
(`lib/tail.ts`). Crews need accounts and a username; up to 50 members a crew and 10 crews a person. The owner can
remove members or reset the invite link; when the owner leaves, the longest-standing member takes over.

**Invite friends** (`lib/referrals.ts`, `/api/referral`): everyone with a username gets an invite link
(`/?ref=username`) on their profile, and opening someone's shared slip counts as their invite too. When a new
account (under three days old) signs up from one, both get a free week of Pro: a trial pass that stacks on a running
week and leaves a paid plan alone. One claim per account and up to 12 rewarded invites per person. Needs accounts and
Pro set up; trial weeks can still buy a plan.

**First visit:** a three-step walkthrough at the bottom of the Board follows what the person does (tap a game, tap a
player and pick a side, save the slip) and pulses what to tap next. It doesn't show for anyone with saved slips.

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

1. In Stripe, create a product "LayLock Pro" with a monthly and a yearly recurring price. Copy
   each price ID (`price_...`) into `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY`.
2. Copy the secret key into `STRIPE_SECRET_KEY` and set the two `NEXT_PUBLIC_PRO_*_LABEL`s.
3. Turn on the customer portal (Settings → Billing → Customer portal) so subscribers can cancel.
4. The database (Upstash) is required: it's where Pro keys and used codes are kept.
5. For free lifetime passes, put codes in `LIFETIME_CODES`, comma separated, or make them on `/admin`. Each works once.

## Next up

- Accounts instead of sync codes
