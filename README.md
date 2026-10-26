# PickSlix

Tracks DraftKings Pick 6 over/under player props for NBA and NFL and estimates
the chance each one hits, using recent games, the opponent matchup, and injury news.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # model tests
```

It runs on sample lines and generated stats out of the box. Copy `.env.example`
to `.env.local` and add a balldontlie key to pull real NBA game logs.

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
- Saved slips and hand-entered lines live in the browser (localStorage) for now.

## Next up

- Real lines: The Odds API DraftKings player props, or paste from Pick 6
- Real NFL stats and team defense ratings
- Injury/news feed (ESPN, RotoWire)
- Accounts + database so slips sync across devices
