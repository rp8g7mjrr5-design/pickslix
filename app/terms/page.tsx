import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of service" };

const UPDATED = "October 28, 2026";
const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function Terms() {
  return (
    <div className="help legal">
      <h1>Terms of service</h1>
      <p className="muted">Last updated {UPDATED}</p>

      <h2>What LayLock is</h2>
      <p>
        LayLock estimates the chance that a player goes over or under a fantasy line, from public stats, matchups and news. It&apos;s a
        research tool. We don&apos;t take entries or handle money for contests, and we aren&apos;t affiliated with DraftKings.
      </p>

      <h2>No guarantees</h2>
      <p>
        Every number is a model estimate and can be wrong. Stats, lines and injury news can be late or missing. Decide for yourself and
        only play what you can afford to lose. We aren&apos;t responsible for entries you make or money you lose.
      </p>

      <h2>Who can use it</h2>
      <p>
        You must be 21 or older (or the legal age where you live) and allowed to play fantasy contests there. Gambling problem? Call
        1-800-GAMBLER.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your sign-in to yourself. Pick a username that isn&apos;t offensive or pretending to be someone else. We can remove usernames,
        hide people from the leaderboard or close accounts that abuse LayLock, its invites or other people.
      </p>

      <h2>Pro</h2>
      <p>
        Pro is a subscription billed monthly or yearly through Stripe until you cancel. Cancel any time from the{" "}
        <Link href="/pro">Pro page</Link>; you keep Pro until the end of the period you paid for. Free weeks from invites end on their own.
        Features can change as LayLock improves.
      </p>

      <h2>Use it fairly</h2>
      <p>Don&apos;t scrape LayLock, overload it, get around Pro, or create accounts to farm invite rewards.</p>

      <h2>Changes</h2>
      <p>We may update these terms; the date above shows when. Using LayLock after a change means you accept it.</p>
      <p>
        See also the <Link href="/privacy">privacy policy</Link>.
        {contact && (
          <>
            {" "}
            Questions: <a href={`mailto:${contact}`}>{contact}</a>
          </>
        )}
      </p>
    </div>
  );
}
