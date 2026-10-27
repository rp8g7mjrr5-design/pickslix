"use client";

import { useEffect, useState } from "react";

interface Status {
  database: boolean;
  cron: boolean;
  screenshots: boolean;
  odds: boolean;
  oddsRemaining: number | null;
  defenseUpdatedAt: string | null;
  dataSource: string;
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
          ok: s.screenshots,
          title: "Sharper screenshot reading",
          on: "Screenshots are read by Claude, which handles busy Pick 6 screens well.",
          off: "Add ANTHROPIC_API_KEY for much better screenshot reading. Without it, screenshots are read on your phone, which misses more.",
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
