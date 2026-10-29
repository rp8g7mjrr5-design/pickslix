import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "How it works" };

const FAQ: [string, React.ReactNode][] = [
  [
    "What does this app do?",
    "It estimates the chance a player goes over (More) or under (Less) a DraftKings Pick 6 line, using their recent games, the matchup and injury news. It helps you pick, but you still place the entry in the DraftKings app.",
  ],
  [
    "How do I make a pick?",
    <>
      On the <Link href="/">Board</Link>, tap a game, then a player. Pick the stat, set the line to the number Pick 6 shows, and tap More or Less.
      You can also tap <em>Paste lines</em> and paste them in as text.
    </>,
  ],
  [
    "What do the percentages mean?",
    "The model's chance that side hits. 60% means it expects that pick to win about 6 times out of 10. The side marked Model pick is the one it likes. Anything near 50% is a coin flip.",
  ],
  [
    "What's a good pick?",
    "Higher is better. On a normal Pick 6 payout, each pick needs roughly 55 to 58% to be worth it. Your slip works this out for you and says Worth it or Not worth it.",
  ],
  [
    "What is expected profit?",
    "What you'd win or lose per entry on average if you played the same slip many times. Positive means the payout is better than the odds of hitting. It's an average, not a promise for any one slip.",
  ],
  [
    "Why doesn't the payout match the DraftKings app?",
    "Pick 6 changes its payout depending on the picks you choose. Type the real number from the DraftKings app into Payout × on your slip and everything updates.",
  ],
  [
    "Do I have to mark wins and losses?",
    <>
      No. Tap <em>Save to tracker</em> on your slip. After the games end, the <Link href="/tracker">Tracker</Link> grades each pick from the box score. While a game is on,
      it shows how each pick is doing live. If a grade looks wrong, tap <em>Fix a result</em>.
    </>,
  ],
  [
    "What's the pick of the day?",
    "Once lines are up, the model picks the one line on today's slate it likes most, with a real sample behind it and no injury flag. It's graded in public after the game, and its record sits right on the card.",
  ],
  [
    "What's the Daily Lock?",
    <>
      A free game on the <Link href="/lock">Lock</Link> tab. Each day pick one side of one line from a short menu. Hit it and your streak grows, miss and it
      starts over. Skipping a day doesn&apos;t break it. Badges at 5, 10 and 20 in a row.
    </>,
  ],
  [
    "What does \"Where Pick 6 is behind\" mean?",
    "Pick 6 moves its lines slowly. A soft line is one where the sportsbooks have moved past Pick 6, so one side is better than it looks. An injury ripple is a teammate whose line hasn't caught up with a starter being ruled out. Soft lines are a Pro feature; ripples are free.",
  ],
  [
    "Can I just ask about a player?",
    "Yes. Type a question on the Board, like \"Is Tatum's 27.5 points safe?\", and you get the model's read: its lean, what it expects, recent form and what the books say.",
  ],
  [
    "How do crew contests work?",
    <>
      Every <Link href="/crews">crew</Link> plays a week-long contest on the picks you already save: most hits minus misses by Sunday night wins. Want a
      one-on-one? Start a head-to-head with a friend.
    </>,
  ],
  [
    "What's the bankroll coach?",
    "Set a weekly budget on the Tracker. Your slip then suggests an entry sized to its edge, tells you when a slip isn't worth playing, and gives you a nudge if you start chasing losses.",
  ],
  [
    "Can I get Pro free?",
    <>
      Yes. Share your invite link from your <Link href="/profile">profile</Link>, or share a slip. When a friend signs up from it, you both get a week of Pro.
    </>,
  ],
  [
    "What are Crews?",
    <>
      Private groups for you and your friends. Start one on the <Link href="/crews">Crews</Link> tab, send the invite link, and see each other's picks.
      Tap <em>Tail</em> to copy a friend's slip into yours.
    </>,
  ],
  [
    "What does Pro add?",
    <>
      Pick 6 lines filled in for you, one-tap best slips, insights on how you do, the model report card and CSV export. See <Link href="/pro">Pro</Link>.
    </>,
  ],
  [
    "Is this a guarantee?",
    "No. These are estimates from public stats, and players have off nights. Only play what you can afford to lose. 21+. If gambling stops being fun, call 1-800-GAMBLER.",
  ],
];

export default function HelpPage() {
  return (
    <div className="help">
      <h1>How it works</h1>
      <p className="muted">Everything you need, in plain English.</p>
      <div className="faq">
        {FAQ.map(([q, a], i) => (
          <details key={q} open={i < 3}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
      <Link href="/" className="button">
        Start picking
      </Link>
    </div>
  );
}
