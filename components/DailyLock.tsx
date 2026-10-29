"use client";
// Daily Lock: one pick a day from a short menu. Hit it and the streak grows; miss and it starts over.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SignInPrompt, useAccount } from "@/components/Account";
import Avatar from "@/components/Avatar";
import { pct } from "@/lib/format.ts";
import { BADGES, type LockEntry, type LockOption, type LockRecord } from "@/lib/lock.ts";
import { syncCode } from "@/lib/storage.ts";
import { STATS } from "@/lib/types.ts";

type Option = Omit<LockOption, "lean" | "leanProb"> & { lean?: LockOption["lean"]; leanProb?: number; result?: LockEntry["result"] };

export interface LockData {
  enabled: boolean;
  menu: { date: string; options: Option[] } | null;
  today: LockEntry | null;
  record: LockRecord;
  badges: number[];
  next: number | null;
  recent: LockEntry[];
  account: boolean;
}

interface Leader extends LockRecord {
  username: string;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
const sideWord = (s: "OVER" | "UNDER") => (s === "OVER" ? "More" : "Less");

export function useLock() {
  const [data, setData] = useState<LockData | null>(null);
  const load = useCallback(
    () =>
      fetch(`/api/lock?code=${encodeURIComponent(syncCode())}`, { cache: "no-store" })
        .then((r) => r.json() as Promise<LockData>)
        .then(setData)
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  return { data, setData, load };
}

export default function DailyLock() {
  const account = useAccount();
  const { data, setData, load } = useLock();
  const [leaders, setLeaders] = useState<Leader[] | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    fetch("/api/lock/leaders", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ rows: Leader[] }>)
      .then((d) => setLeaders(d.rows))
      .catch(() => setLeaders([]));
  }, []);

  const pick = async (o: Option, side: "OVER" | "UNDER") => {
    setBusy(`${o.id}:${side}`);
    setNote("");
    const r = await fetch("/api/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId: o.id, side, code: syncCode() }),
    }).catch(() => null);
    const body = (await r?.json().catch(() => ({}))) as { today?: LockEntry; error?: string };
    setBusy("");
    if (!r?.ok || !body.today) return setNote(body.error ?? "Couldn't lock that in. Try again.");
    setData((d) => (d ? { ...d, today: body.today! } : d));
    // Reveal the model's lean now that you've picked.
    load();
  };

  const share = async () => {
    const r = data!.record;
    const text = r.streak
      ? `I'm on a ${r.streak}-pick Daily Lock streak on LayLock. Think you can beat it?`
      : `I'm playing the Daily Lock on LayLock: one pick a day, keep the streak alive.`;
    const url = `${window.location.origin}/lock${account.username ? `?ref=${account.username}` : ""}`;
    try {
      if (navigator.share) return await navigator.share({ title: "Daily Lock", text, url });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    await navigator.clipboard?.writeText(`${text} ${url}`).catch(() => {});
    setNote("Copied. Paste it anywhere.");
  };

  if (!data) return <div className="lockpage"><div className="lockstreak skeletoncard" aria-hidden /></div>;
  const r = data.record;
  const today = data.today;
  const todayOption = today && data.menu?.options.find((o) => o.id === today.option.id);
  const started = todayOption ? Date.parse(todayOption.gameTime) <= Date.now() : false;

  return (
    <div className="lockpage">
      <div className="hero">
        <div>
          <h1>Daily Lock</h1>
          <p className="muted">One pick a day, free. Hit it to grow your streak. Miss and it starts over.</p>
        </div>
      </div>

      <section className="lockstreak">
        <div className="lockcount">
          <StreakRing streak={r.streak} next={data.next} />
          <div>
            <span className="eyebrow">Current streak</span>
            <strong>
              {r.streak} {r.streak >= 5 ? "🔥" : ""}
            </strong>
            <small>{r.streak === 1 ? "hit in a row" : "hits in a row"}</small>
          </div>
        </div>
        <div className="lockstats">
          <span>
            Best <b>{r.best}</b>
          </span>
          <span>
            Record{" "}
            <b>
              {r.hits}–{r.misses}
            </b>
          </span>
          {r.hits + r.misses > 0 && (
            <span>
              Hit rate <b>{pct(r.hits / (r.hits + r.misses))}</b>
            </span>
          )}
        </div>
        <div className="lockbadges" aria-label="Streak badges">
          {BADGES.map((b) => (
            <span key={b} className={`lockbadge ${data.badges.includes(b) ? "on" : ""}`} title={`${b} straight hits`}>
              {b}
            </span>
          ))}
          <small className="muted">{data.next ? `${data.next - r.streak} more for the ${data.next}-streak badge` : "Every badge earned. Legend."}</small>
        </div>
        <button className="ghost small" onClick={share}>
          Share my streak
        </button>
      </section>

      {!data.enabled && <p className="banner">The Daily Lock needs the database set up (KV_REST_API_URL) to save picks.</p>}

      <section className="lockmenu">
        <div className="lockmenuhead">
          <h2>{today ? "Today's lock" : "Pick one for today"}</h2>
          {today && !started && <small className="muted">You can switch until your game starts.</small>}
        </div>
        {!data.menu && <p className="muted">Today's menu shows up once the Pick 6 lines are posted. Check back later today.</p>}
        {data.menu?.options.map((o) => {
          const mine = today?.option.id === o.id ? today.side : null;
          const closed = Date.parse(o.gameTime) <= Date.now() || started;
          return (
            <div key={o.id} className={`lockoption ${mine ? "mine" : ""}`}>
              <Avatar name={o.player} team={o.team} size={44} />
              <div>
                <strong>{o.player}</strong>
                <span className="lockline">
                  <b>{o.line}</b> {STATS[o.stat].label}
                </span>
                <small>
                  {o.sport} · {o.team} vs {o.opponent} · {when(o.gameTime)}
                </small>
                {mine && o.lean && (
                  <small className={o.lean === mine ? "pos" : "muted"}>
                    {o.lean === mine ? `The model agrees: ${sideWord(o.lean)} ${pct(o.leanProb!)}` : `Bold. The model leaned ${sideWord(o.lean)} ${pct(o.leanProb!)}`}
                  </small>
                )}
              </div>
              <div className="locksides">
                {(["OVER", "UNDER"] as const).map((s) => (
                  <button
                    key={s}
                    className={`side ${mine === s ? "selected" : ""}`}
                    aria-pressed={mine === s}
                    disabled={closed || Boolean(busy) || !data.enabled}
                    onClick={() => mine !== s && pick(o, s)}
                  >
                    {busy === `${o.id}:${s}` ? "…" : sideWord(s)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {note && <p className="muted">{note}</p>}
      </section>

      {account.enabled && account.loaded && !account.signedIn && (
        <div className="signinprompt">
          <small>Your streak is saved on this device. Sign in to keep it everywhere and get on the streak leaderboard.</small>
          <SignInPrompt next="/lock">Sign in</SignInPrompt>
        </div>
      )}

      {data.recent.length > 0 && (
        <section className="lockrecent">
          <h2>Your last locks</h2>
          {data.recent.map((e) => (
            <div key={e.date} className="lockrow">
              <span>
                {e.option.player} {sideWord(e.side)} {e.option.line} {STATS[e.option.stat].label}
              </span>
              <span className={`legresult ${e.result}`}>{e.result === "hit" ? "✓ Hit" : e.result === "miss" ? "✗ Miss" : "Push"}</span>
            </div>
          ))}
        </section>
      )}

      {account.enabled && (
        <section className="lockleaders">
          <h2>Longest streaks going</h2>
          {leaders === null ? (
            <p className="muted">Loading…</p>
          ) : !leaders.length ? (
            <p className="muted">Nobody's on the board yet. Hit today's lock and you're first.</p>
          ) : (
            <ol className="leaderlist">
              {leaders.slice(0, 20).map((l, i) => (
                <li key={l.username} className={`leader ${l.username.toLowerCase() === account.username?.toLowerCase() ? "me" : ""} ${i < 3 ? `top${i + 1}` : ""}`}>
                  <span className="place">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
                  <span className="who">
                    <strong>{l.username}</strong>
                    <small>
                      Best {l.best} · {l.hits}–{l.misses}
                    </small>
                  </span>
                  <span className="num">
                    <strong>{l.streak}</strong>
                    <small className="muted">streak</small>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      <p className="fine">
        Free to play, no money involved. Lines come from today's Pick 6 board and grade from the box score. <Link href="/help">How it works</Link>
      </p>
    </div>
  );
}

/** The streak as a ring that fills toward the next badge. */
function StreakRing({ streak, next }: { streak: number; next: number | null }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const prev = BADGES.filter((b) => b <= streak).pop() ?? 0;
  const share = next ? (streak - prev) / (next - prev) : 1;
  return (
    <svg className="streakring" viewBox="0 0 80 80" width="80" height="80" aria-hidden>
      <defs>
        <linearGradient id="ringgrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd66b" />
          <stop offset="1" stopColor="#ff8a3d" />
        </linearGradient>
      </defs>
      <circle cx="40" cy="40" r={R} className="ringtrack" />
      {share > 0 && <circle cx="40" cy="40" r={R} className="ringfill" strokeDasharray={`${share * C} ${C}`} />}
      <text x="40" y="40" dominantBaseline="central" textAnchor="middle">
        🔒
      </text>
    </svg>
  );
}

/** The Board's nudge toward today's lock. */
export function LockTeaser() {
  const { data } = useLock();
  if (!data?.menu) return null;
  const r = data.record;
  const today = data.today;
  return (
    <Link href="/lock" className="lockteaser">
      <span className="lockflame" aria-hidden>
        {r.streak >= 5 ? "🔥" : "🔒"}
      </span>
      <span>
        <strong>Daily Lock</strong>
        <small>
          {today
            ? `Locked: ${today.option.player} ${sideWord(today.side)} ${today.option.line}${r.streak ? ` · streak ${r.streak}` : ""}`
            : r.streak
              ? `Keep your ${r.streak}-hit streak alive. Pick today's lock.`
              : "One free pick a day. How long can you keep a streak going?"}
        </small>
      </span>
      <b aria-hidden>›</b>
    </Link>
  );
}
