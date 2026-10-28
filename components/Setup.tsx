"use client";

import { useEffect, useState } from "react";

interface Status {
  database: boolean;
  cron: boolean;
  odds: boolean;
  oddsRemaining: number | null;
  defenseUpdatedAt: string | null;
  dataSource: string;
  accounts: boolean;
  stripe: boolean;
  stripePrices: boolean;
  lifetimeCodes: number;
  tips: boolean;
  alerts: boolean;
}

const ago = (iso: string) => {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3600_000);
  return h < 1 ? "under an hour ago" : h < 48 ? `${h} hours ago` : `${Math.round(h / 24)} days ago`;
};

export default function Setup() {
  const [s, setS] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setS)
      .catch(() => setFailed(true));
  }, []);

  const items = s
    ? [
        {
          ok: s.odds,
          title: "Auto-filled lines",
          on: `Pick 6 lines load when you open a game.${s.oddsRemaining !== null ? ` ${s.oddsRemaining} Odds API credits left this month.` : ""}`,
          off: "Add ODDS_API_KEY (free at the-odds-api.com). Until then lines start at the season average.",
        },
        {
          ok: s.alerts,
          title: "Phone alerts",
          on: "People can turn on alerts for players ruled out and line moves. The GitHub workflow in .github/workflows/alerts.yml checks every 15 minutes once its SITE_URL and CRON_SECRET secrets are set.",
          off: "Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (make a pair with: npx web-push generate-vapid-keys), then set the SITE_URL and CRON_SECRET secrets on the GitHub repo so the check runs every 15 minutes.",
        },
        {
          ok: s.database,
          title: "Saved slips sync",
          on: "Slips are saved to the database and sync across devices with your sync code.",
          off: "Add the free Upstash Redis integration from the Vercel Marketplace (Storage tab). Until then slips stay on each device.",
        },
        {
          ok: s.cron,
          title: "Daily refresh",
          on: s.defenseUpdatedAt
            ? `Team defense stats last refreshed ${ago(s.defenseUpdatedAt)}.`
            : "The daily job is set up; it hasn't saved a refresh yet.",
          off: "Add CRON_SECRET (any long random string) so the daily refresh job runs securely.",
        },
        {
          ok: s.accounts && s.database,
          title: "Accounts",
          on: "People sign in with Google, Apple or an email code. Pro and saved slips follow them to every device.",
          off: !s.accounts
            ? "Optional. Add Clerk from the Vercel Marketplace (Integrations) to turn on sign-in. Until then people use Pro keys and sync codes."
            : "Accounts need the database to save Pro and slips. Add the Upstash Redis integration.",
        },
        {
          ok: s.stripe && s.stripePrices && s.database,
          title: "Pro subscriptions",
          on: "Stripe checkout is on. Auto-filled lines and the report card need Pro.",
          off: !s.stripe
            ? "Optional. Add STRIPE_SECRET_KEY plus STRIPE_PRICE_MONTHLY and/or STRIPE_PRICE_YEARLY to sell Pro. Until then everything is free."
            : !s.stripePrices
              ? "STRIPE_SECRET_KEY is set, but add STRIPE_PRICE_MONTHLY and/or STRIPE_PRICE_YEARLY (price IDs starting with price_)."
              : "Pro needs the database to remember who paid. Add the Upstash Redis integration.",
        },
        {
          ok: s.lifetimeCodes > 0,
          title: "Lifetime codes",
          on: `${s.lifetimeCodes} lifetime code${s.lifetimeCodes === 1 ? "" : "s"} set up. Each one works once.`,
          off: "Optional. Add LIFETIME_CODES (comma separated) to give free lifetime Pro to friends and family.",
        },
        {
          ok: s.tips,
          title: "Tip jar",
          on: "The tip link shows in the footer and on the Pro page.",
          off: "Optional. Add NEXT_PUBLIC_TIP_URL (a Ko-fi or Buy Me a Coffee link) to show a tip button.",
        },
      ]
    : [];

  return (
    <div className="tracker">
      <div className="hero">
        <div>
          <h1>Setup check</h1>
          <p className="muted">
            What this site has turned on. Add missing keys in Vercel under Project → Settings → Environment Variables,
            then redeploy.
          </p>
        </div>
      </div>
      {failed && <p className="warn">Couldn't reach the server.</p>}
      {!s && !failed && <p className="muted">Checking…</p>}
      {s && s.dataSource === "sample" && (
        <p className="banner">DATA_SOURCE is set to "sample", so the site shows made-up stats. Remove it to use live ESPN data.</p>
      )}
      <div className="checks">
        {items.map((i) => (
          <div key={i.title} className={`check ${i.ok ? "ok" : "off"}`}>
            <span className="checkicon" aria-hidden>
              {i.ok ? "✓" : "!"}
            </span>
            <div>
              <strong>{i.title}</strong>
              <small>{i.ok ? i.on : i.off}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
