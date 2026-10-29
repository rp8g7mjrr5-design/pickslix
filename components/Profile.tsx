"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { clvSummary } from "@/lib/clv.ts";
import { hotSpots, SPOT_MIN } from "@/lib/hotspots.ts";
import { pct } from "@/lib/format.ts";
import { leaderStats, MIN_PICKS } from "@/lib/leaderboard.ts";
import { usePro } from "@/lib/proClient.ts";
import { profileStats, type Split } from "@/lib/profile.ts";
import { loadSlips, pullSlips, type SavedSlip } from "@/lib/storage.ts";
import { STATS } from "@/lib/types.ts";
import { SignInPrompt, useAccount } from "@/components/Account";
import { UsernameField } from "@/components/Username";
import { AlertsToggle } from "@/components/Alerts";
import { InviteCard } from "@/components/Invite";

const money = (x: number) => `${x >= 0 ? "+" : "−"}$${Math.abs(x).toFixed(2)}`;
const rate = (s: Split) => (s.n ? s.hits / s.n : 0);

export default function Profile() {
  const account = useAccount();
  const [slips, setSlips] = useState<SavedSlip[]>([]);
  const [rank, setRank] = useState<number | null>(null);

  useEffect(() => {
    const load = () => {
      setSlips(loadSlips());
      pullSlips().then((r) => setSlips(r.slips));
    };
    load();
    window.addEventListener("pickslix:account", load);
    return () => window.removeEventListener("pickslix:account", load);
  }, []);

  useEffect(() => {
    if (!account.username || account.hidden) return setRank(null);
    fetch("/api/leaderboard", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ rows: { username: string }[] }>)
      .then((d) => {
        const i = d.rows.findIndex((r) => r.username.toLowerCase() === account.username!.toLowerCase());
        setRank(i >= 0 ? i + 1 : null);
      })
      .catch(() => {});
  }, [account.username, account.hidden]);

  const s = useMemo(() => profileStats(slips), [slips]);
  const counted = useMemo(() => leaderStats(slips), [slips]);
  const beat = s.picks ? s.hitRate - s.expected : 0;
  const clv = useMemo(() => clvSummary(slips), [slips]);
  const spots = useMemo(() => hotSpots(slips), [slips]);

  return (
    <div className="profile">
      {account.enabled && account.signedIn ? (
        <ProfileHead rank={rank} counted={counted.picks} />
      ) : (
        <div className="hero">
          <div>
            <h1>Profile</h1>
            <p className="muted">Your record from the picks saved on this device.</p>
          </div>
        </div>
      )}
      {account.enabled && account.loaded && !account.signedIn && (
        <div className="signinprompt">
          <small>Sign in to keep your record on every device, pick a username and join the leaderboard.</small>
          <SignInPrompt next="/profile">Sign in</SignInPrompt>
        </div>
      )}

      {!s.picks ? (
        <div className="emptycard">
          <p>No graded picks yet. Save a slip from the Board and your record builds here as games finish.</p>
          <Link href="/" className="button">
            Go to the Board
          </Link>
        </div>
      ) : (
        <>
          <div className="cards profilecards">
            <div className="card">
              <small>Record</small>
              <strong>
                {s.hits}–{s.picks - s.hits}
              </strong>
              <small>{pct(s.hitRate)} of picks hit</small>
            </div>
            <div className="card">
              <small>Vs the model</small>
              <strong className={beat >= 0 ? "pos" : "neg"}>
                {beat >= 0 ? "+" : "−"}
                {Math.abs(beat * 100).toFixed(1)}
              </strong>
              <small>
                points {beat >= 0 ? "above" : "below"} the model&apos;s {pct(s.expected)}
              </small>
            </div>
            <div className="card">
              <small>Slips</small>
              <strong className={s.profit >= 0 ? "pos" : "neg"}>{s.slips.settled ? money(s.profit) : "—"}</strong>
              <small>
                {s.slips.won} of {s.slips.settled} won{s.roi !== null ? ` · ${s.roi >= 0 ? "+" : ""}${pct(s.roi)} ROI` : ""}
              </small>
            </div>
            <div className="card">
              <small>Streak</small>
              <strong className={s.streak.kind === "hit" ? "pos" : s.streak.kind === "miss" ? "neg" : ""}>
                {s.streak.current ? `${s.streak.current} ${s.streak.kind === "hit" ? (s.streak.current === 1 ? "win" : "wins") : s.streak.current === 1 ? "loss" : "losses"}` : "—"}
              </strong>
              <small>Best run: {s.streak.best} straight hits</small>
            </div>
          </div>

          <section className="report">
            <div className="reporthead">
              <h2>Last {s.form.length}</h2>
              <small>Oldest to newest</small>
            </div>
            <div className="form" aria-label={`Last ${s.form.length}: ${s.form.filter((f) => f === "hit").length} hit`}>
              {s.form.map((f, i) => (
                <i key={i} className={f}>
                  {f === "hit" ? "W" : "L"}
                </i>
              ))}
            </div>
          </section>

          <div className="profilegrid">
            <section className="report">
              <div className="reporthead">
                <h2>By sport</h2>
              </div>
              <SplitList rows={s.bySport.map((x) => ({ label: x.sport, ...x }))} />
            </section>
            <section className="report">
              <div className="reporthead">
                <h2>Your props</h2>
                <small>Most played</small>
              </div>
              <SplitList rows={s.byStat.slice(0, 5).map((x) => ({ label: STATS[x.stat]?.label ?? x.stat, ...x }))} />
            </section>
            <section className="report">
              <div className="reporthead">
                <h2>Overs vs unders</h2>
              </div>
              <SplitList
                rows={[
                  { label: "Overs", ...s.overs },
                  { label: "Unders", ...s.unders },
                ].filter((r) => r.n)}
              />
            </section>
            {clv.n > 0 && (
              <section className="report">
                <div className="reporthead">
                  <h2>Closing line</h2>
                  <small>Did the books move your way?</small>
                </div>
                <strong className={clv.beat >= clv.lost ? "pos" : "neg"}>
                  Beat the close on {clv.beat} of {clv.n} picks
                </strong>
                <small>
                  Average move {clv.avg >= 0 ? "+" : "−"}
                  {Math.abs(clv.avg * 100).toFixed(1)} points toward your side.
                </small>
              </section>
            )}
            <section className="report">
              <div className="reporthead">
                <h2>Hot spots</h2>
                <small>Where you hit most and least</small>
              </div>
              {spots.hot.length || spots.cold.length ? (
                <ul className="spots">
                  {spots.hot.slice(0, 3).map((x) => (
                    <li key={x.label}>
                      <span>🔥 {x.label}</span>
                      <b className="pos">
                        {pct(x.rate)} <small>of {x.n}</small>
                      </b>
                    </li>
                  ))}
                  {spots.cold.slice(0, 2).map((x) => (
                    <li key={x.label}>
                      <span>🧊 {x.label}</span>
                      <b className="neg">
                        {pct(x.rate)} <small>of {x.n}</small>
                      </b>
                    </li>
                  ))}
                </ul>
              ) : (
                <small className="muted">Once you have {SPOT_MIN} graded picks of one kind (say, NBA rebound unders), your best and worst show up here, and the Board points out tonight&apos;s lines that fit.</small>
              )}
            </section>
            {s.bestCall && (
              <section className="report bestcall">
                <div className="reporthead">
                  <h2>Best call</h2>
                  <small>The hit the model liked least</small>
                </div>
                <strong>
                  {s.bestCall.player} {s.bestCall.side === "OVER" ? "over" : "under"} {s.bestCall.line} {STATS[s.bestCall.stat]?.label.toLowerCase()}
                </strong>
                <small>The model gave it {pct(s.bestCall.prob)}.</small>
              </section>
            )}
          </div>
        </>
      )}
      <InviteCard />
      <AlertsToggle />
      {account.enabled && account.signedIn && <AccountActions />}
    </div>
  );
}

function SplitList({ rows }: { rows: (Split & { label: string })[] }) {
  if (!rows.length) return <small className="muted">Nothing graded yet.</small>;
  return (
    <ul className="splitlist">
      {rows.map((r) => (
        <li key={r.label}>
          <span>{r.label}</span>
          <div className="bucketbar" aria-hidden>
            <i className={rate(r) >= r.expected ? "good" : "meh"} style={{ width: `${rate(r) * 100}%` }} />
            <b style={{ left: `${r.expected * 100}%` }} />
          </div>
          <span className="num">
            {r.hits}/{r.n} <small>{pct(rate(r))}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ProfileHead({ rank, counted }: { rank: number | null; counted: number }) {
  const account = useAccount();
  const { user } = useUser();
  const pro = usePro();
  const [editing, setEditing] = useState(false);
  const joined = user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "";
  return (
    <div className="profilehead">
      {user?.imageUrl ? <img className="avatar" src={user.imageUrl} alt="" width={64} height={64} /> : <span className="avatar" />}
      <div className="profilewho">
        {editing ? (
          <UsernameField initial={account.username ?? ""} submitLabel="Save" onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <h1>
              {account.username ? `@${account.username}` : user?.fullName || "Your profile"}
              {pro?.pro && <span className="probadge">PRO</span>}
            </h1>
            <small>
              {[user?.fullName && account.username ? user.fullName : "", joined && `Joined ${joined}`].filter(Boolean).join(" · ")}
            </small>
            <div className="profiletags">
              {account.hidden ? (
                <span className="tag">Hidden from leaderboard</span>
              ) : rank ? (
                <Link href="/leaderboard" className="tag good">
                  #{rank} on the leaderboard
                </Link>
              ) : (
                <span className="tag">
                  {counted >= MIN_PICKS ? "Leaderboard updates every 10 minutes" : `${counted}/${MIN_PICKS} picks to be ranked`}
                </span>
              )}
              {!pro?.pro && pro?.required && (
                <Link href="/pro" className="tag pro">
                  Go Pro
                </Link>
              )}
            </div>
          </>
        )}
      </div>
      {!editing && account.username && (
        <button className="ghost small" onClick={() => setEditing(true)}>
          Edit
        </button>
      )}
    </div>
  );
}

function AccountActions() {
  const account = useAccount();
  const { openUserProfile, signOut } = useClerk();
  const [busy, setBusy] = useState(false);
  const toggleHidden = async () => {
    setBusy(true);
    const r = await fetch("/api/account/username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: !account.hidden }),
    }).catch(() => null);
    setBusy(false);
    if (r?.ok) account.setHidden(!account.hidden);
  };
  return (
    <section className="report profileactions">
      <div className="reporthead">
        <h2>Account</h2>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={!account.hidden} onChange={toggleHidden} disabled={busy} />
        <span>
          Show me on the leaderboard
          <small>Your picks keep counting either way.</small>
        </span>
      </label>
      <div className="profilebuttons">
        <button className="ghost" onClick={() => openUserProfile()}>
          Email, sign-in and security
        </button>
        <Link href="/tracker" className="button ghost">
          All my slips
        </Link>
        <button className="ghost" onClick={() => signOut({ redirectUrl: "/" })}>
          Sign out
        </button>
      </div>
    </section>
  );
}
