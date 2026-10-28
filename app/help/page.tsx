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
