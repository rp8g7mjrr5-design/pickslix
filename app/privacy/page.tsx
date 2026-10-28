import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy policy" };

const UPDATED = "October 28, 2026";
const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function Privacy() {
  return (
    <div className="help legal">
      <h1>Privacy policy</h1>
      <p className="muted">Last updated {UPDATED}</p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account.</strong> If you sign in, our sign-in provider (Clerk) gives us your name, email address and profile
          picture, from Google, Apple or the email you used.
        </li>
        <li>
          <strong>What you save in LayLock.</strong> Your username, saved slips and their results, crews you join, who invited you, and
          whether you hide from the leaderboard.
        </li>
        <li>
          <strong>Payments.</strong> Stripe handles card details; we never see them. We keep the Stripe customer and subscription ids so
          Pro works and can be managed.
        </li>
        <li>
          <strong>Phone alerts.</strong> If you turn them on, your browser gives us a push address for this device so we can send them.
        </li>
        <li>
          <strong>On your device.</strong> Your current slip, settings and a sync code are kept in your browser&apos;s storage.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To run LayLock: keep your picks and Pro on every device, grade your picks, show the leaderboard and crews, send the alerts you
        asked for, and handle payments. Your username, record and shared slips are public when you choose to show them. We don&apos;t
        sell your information or use it for advertising.
      </p>

      <h2>Who we share it with</h2>
      <p>
        Only the services LayLock runs on: Clerk (sign-in), Upstash (our database), Vercel (hosting), Stripe (payments) and your browser&apos;s
        push service (alerts). Sports stats and odds come from public feeds; nothing about you is sent to them.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Hide from the leaderboard any time on your <Link href="/profile">profile</Link>.</li>
        <li>Turn alerts off from your profile or the Tracker.</li>
        <li>Delete saved slips on the Tracker.</li>
        <li>
          To delete your account and everything saved with it, {contact ? <a href={`mailto:${contact}`}>email us</a> : "contact us"} and
          we&apos;ll remove it.
        </li>
      </ul>

      <h2>Age</h2>
      <p>LayLock is for people 21 and older (or the legal age for fantasy sports where you live).</p>

      <h2>Changes</h2>
      <p>If this policy changes, we&apos;ll update the date above.</p>
      {contact && (
        <p>
          Questions: <a href={`mailto:${contact}`}>{contact}</a>
        </p>
      )}
    </div>
  );
}
