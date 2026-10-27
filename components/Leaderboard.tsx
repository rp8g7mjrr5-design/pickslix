"use client";

import { useEffect, useState } from "react";
import { pct } from "@/lib/format.ts";
import { SignInPrompt, useAccount } from "@/components/Account";

interface Row {
  username: string;
  pro: boolean;
  gold?: boolean;
  picks: number;
  hits: number;
  hitRate: number;
  slips: number;
  roi: number | null;
}

export default function Leaderboard() {
  const account = useAccount();
  const [data, setData] = useState<{ rows: Row[]; at: string; minPicks: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/leaderboard", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Couldn't load the leaderboard."));
  }, []);

  const me = account.username?.toLowerCase();
  const myRank = data?.rows.findIndex((r) => r.username.toLowerCase() === me) ?? -1;

  return (
    <div className="leaders">
      <div className="hero">
        <div>
          <h1>Leaderboard</h1>
          <p className="muted">
            Ranked by hit rate. Only picks graded from box scores and saved before the game count
            {data ? `, and you need ${data.minPicks} to be ranked` : ""}.
          </p>
        </div>
      </div>

      {account.enabled && account.loaded && !account.signedIn && (
        <div className="signinprompt">
          <small>Sign in and pick a username to join the leaderboard.</small>
          <SignInPrompt>Sign in</SignInPrompt>
        </div>
      )}
      {account.signedIn && <UsernameForm />}
      {account.signedIn && account.username && data && (
        <p className="fine">{myRank >= 0 ? `You're #${myRank + 1}.` : `Get ${data.minPicks} graded picks to show up here.`}</p>
      )}

      {error && <p className="error">{error}</p>}
      {!data && !error && <div className="table">{Array.from({ length: 5 }, (_, i) => <div key={i} className="leader skeletoncard" aria-hidden />)}</div>}
      {data && !data.rows.length && (
        <div className="emptycard">
          <p>No one is ranked yet. Save slips before games start, and they'll grade themselves into the standings.</p>
        </div>
      )}
      {data && data.rows.length > 0 && (
        <ol className="leaderlist">
          {data.rows.map((r, i) => (
            <li key={r.username} className={`leader ${r.username.toLowerCase() === me ? "me" : ""} ${i < 3 ? `top${i + 1}` : ""}`}>
              <span className="place">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
              <span className="who">
                <strong>
                  {r.username}
                  {r.pro && <span className={`probadge ${r.gold ? "gold" : ""}`}>PRO</span>}
                </strong>
                <small>
                  {r.hits}/{r.picks} picks{r.slips ? ` · ${r.slips} slip${r.slips === 1 ? "" : "s"}` : ""}
                </small>
              </span>
              <span className="num">
                <strong>{pct(r.hitRate)}</strong>
                <small className={r.roi == null ? "muted" : r.roi >= 0 ? "pos" : "neg"}>
                  {r.roi == null ? "–" : `${r.roi >= 0 ? "+" : ""}${(r.roi * 100).toFixed(0)}% ROI`}
                </small>
              </span>
            </li>
          ))}
        </ol>
      )}
      {data && <p className="fine">Updated {new Date(data.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}. Refreshes every 10 minutes.</p>}
    </div>
  );
}

/** Pick, change or remove the name shown on the leaderboard. */
export function UsernameForm() {
  const account = useAccount();
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const save = async (name: string) => {
    setBusy(true);
    setNote("");
    const r = await fetch("/api/account/username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name }),
    })
      .then((x) => x.json() as Promise<{ username?: string | null; error?: string }>)
      .catch(() => ({ error: "Try again." }) as { username?: string | null; error?: string });
    setBusy(false);
    if (r.error) return setNote(r.error);
    account.setUsername(r.username ?? null);
    setEditing(false);
    setNote(r.username ? "Saved. Your spot updates within 10 minutes." : "You're off the leaderboard.");
  };

  if (account.username && !editing) {
    return (
      <div className="sync">
        <small>Your username</small>
        <code>{account.username}</code>
        <button className="ghost small" onClick={() => (setValue(account.username ?? ""), setEditing(true))}>
          Change
        </button>
        <button className="ghost small" onClick={() => confirm("Take yourself off the leaderboard?") && save("")} disabled={busy}>
          Leave leaderboard
        </button>
        {note && <small className="muted">{note}</small>}
      </div>
    );
  }
  return (
    <form
      className="sync"
      onSubmit={(e) => {
        e.preventDefault();
        save(value);
      }}
    >
      <input placeholder="Pick a username" value={value} onChange={(e) => setValue(e.target.value)} maxLength={20} autoCapitalize="none" autoCorrect="off" aria-label="Username" />
      <button type="submit" disabled={busy || !value.trim()}>
        {busy ? "Saving…" : account.username ? "Save" : "Join leaderboard"}
      </button>
      {editing && (
        <button type="button" className="ghost" onClick={() => setEditing(false)}>
          Cancel
        </button>
      )}
      {note && <small className="neg">{note}</small>}
    </form>
  );
}
