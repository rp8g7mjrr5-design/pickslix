"use client";
// The home page: today's Pick 6 slip for each sport, built and kept up to date by LayLock with no one picking, and
// each sport's record.
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertsToggle } from "@/components/Alerts";
import { slipText, type AutoLeg, type AutoRecord, type AutoSlip } from "@/lib/autoSlip.ts";
import { pct } from "@/lib/format.ts";
import { STATS, type Sport } from "@/lib/types.ts";

const SPORTS: Sport[] = ["NBA", "NFL"];

interface Data {
  sport: Sport;
  slip: AutoSlip | null;
  record: AutoRecord;
  recent: AutoSlip[];
}

const PICK6_URL = "https://pick6.draftkings.com/";
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} hr ago`;
};
const day = (d: string) => new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const money = (x: number) => `${x >= 0 ? "+" : "−"}$${Math.abs(x).toFixed(2)}`;
const RESULT = { hit: "Hit ✓", miss: "Missed", push: "Push" } as const;

export default function AutoSlipPage() {
  const [sport, setSport] = useState<Sport | null>(null);
  const [today, setToday] = useState<Record<string, number>>({});
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  // Start on the sport in the link (alerts open ?sport=NFL), else the first one with a slip today.
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("sport")?.toUpperCase() as Sport | undefined;
    fetch("/api/auto")
      .then((r) => r.json() as Promise<{ sports: { sport: Sport; picks: number }[] }>)
      .then((d) => {
        setToday(Object.fromEntries(d.sports.map((x) => [x.sport, x.picks])));
        setSport((cur) => cur ?? (asked && SPORTS.includes(asked) ? asked : (d.sports.find((x) => x.picks)?.sport ?? "NBA")));
      })
      .catch(() => setSport((cur) => cur ?? (asked && SPORTS.includes(asked) ? asked : "NBA")));
  }, []);

  useEffect(() => {
    if (!sport) return;
    let live = true;
    setData(null);
    setFailed(false);
    const load = () =>
      fetch(`/api/auto?sport=${sport}`)
        .then((r) => (r.ok ? (r.json() as Promise<Data>) : Promise.reject(r.status)))
        .then((d) => {
          if (!live) return;
          setData(d);
          setFailed(false);
          setToday((t) => ({ ...t, [sport]: d.slip?.legs.length ?? 0 }));
        })
        .catch(() => live && setFailed(true));
    load();
    // Keep it current while the page is open: the slip is re-checked every ten minutes on the server.
    const t = setInterval(load, 5 * 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [sport]);

  const tabs = (
    <div className="seg autotabs" role="group" aria-label="Sport">
      {SPORTS.map((x) => (
        <button key={x} className={sport === x ? "on" : ""} aria-pressed={sport === x} onClick={() => setSport(x)}>
          {x}
          {today[x] ? <span className="segcount">{today[x]}</span> : null}
        </button>
      ))}
    </div>
  );

  if (!data)
    return (
      <div className="auto">
        {tabs}
        <p className="muted">{failed ? "Couldn't load this slip. Reload to try again." : `Scanning today's ${sport ?? ""} lines…`}</p>
      </div>
    );
  const s = data.slip;
  const r = data.record;
  const settled = r.wins + r.losses;

  const copy = async () => {
    if (!s) return;
    try {
      await navigator.clipboard.writeText(slipText(s));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  return (
    <div className="auto">
      {tabs}
      <section className="autohero">
        <span className="autolabel">Today&apos;s {data.sport} auto slip</span>
        {s ? (
          <>
            <h1>
              {s.legs.length}-pick Power Play · pays {s.multiplier}x
            </h1>
            <p className="muted">
              LayLock scanned today&apos;s Pick 6 lines and picked these by itself. It keeps checking until each game starts and swaps any pick that
              stops holding up. Last checked {ago(s.updatedAt)}.
            </p>
          </>
        ) : (
          <>
            <h1>No {data.sport} slip today</h1>
            <p className="muted">
              Either there are no {data.sport} games today, or Pick 6 hasn&apos;t posted enough lines LayLock likes yet. It checks every 15 minutes
              and builds the slip as soon as it can. Turn on alerts and your phone buzzes when it&apos;s ready.
            </p>
          </>
        )}
      </section>

      {s && (
        <>
          <section className="autolegs">
            {s.legs.map((l) => (
              <Leg key={`${l.player}|${l.stat}`} l={l} />
            ))}
          </section>

          <section className="autosum">
            <div className="stat">
              <span>Chance all {s.legs.length} hit</span>
              <strong>{pct(s.chance)}</strong>
            </div>
            <div className="stat">
              <span>$10 entry pays</span>
              <strong>${(10 * s.multiplier).toFixed(0)}</strong>
            </div>
            <div className="stat">
              <span>Average back on $10</span>
              <strong className={s.expected >= 1 ? "pos" : "neg"}>${(10 * s.expected).toFixed(2)}</strong>
            </div>
            {s.result && (
              <div className="stat big">
                <span>Result</span>
                <strong className={s.result === "win" ? "pos" : s.result === "loss" ? "neg" : ""}>{s.result === "win" ? "Won" : s.result === "loss" ? "Lost" : "Refunded"}</strong>
              </div>
            )}
          </section>

          {!s.result && (
            <div className="autoactions">
              <button onClick={copy}>{copied ? "Copied ✓" : "Copy picks"}</button>
              <a className="button ghost" href={PICK6_URL} target="_blank" rel="noopener noreferrer">
                Open Pick 6
              </a>
            </div>
          )}
          <p className="fine">
            Enter these in Pick 6 yourself as a {s.legs.length}-pick entry. LayLock can&apos;t place entries for you: DraftKings doesn&apos;t allow automated
            entries.
          </p>

          {s.changes.length > 0 && (
            <section className="autochanges">
              <h2>What changed today</h2>
              <ul>
                {s.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="autoalerts">
        <AlertsToggle />
      </section>

      <section className="autorecord">
        <h2>{data.sport} track record</h2>
        {settled + r.refunds === 0 ? (
          <p className="muted">No finished slips yet. Every slip gets graded from the box scores, wins and losses alike.</p>
        ) : (
          <div className="cards">
            <div className="card">
              <small>Slips</small>
              <strong>
                {r.wins}–{r.losses}
              </strong>
              <small>{r.refunds ? `${r.refunds} refunded` : "won–lost"}</small>
            </div>
            <div className="card">
              <small>Picks hit</small>
              <strong>{r.legsGraded ? pct(r.legsHit / r.legsGraded) : "—"}</strong>
              <small>
                {r.legsHit} of {r.legsGraded}
              </small>
            </div>
            <div className="card">
              <small>$10 a slip</small>
              <strong className={r.profit10 >= 0 ? "pos" : "neg"}>{money(r.profit10)}</strong>
              <small>if you played every one</small>
            </div>
          </div>
        )}
        {data.recent.map((h) => (
          <div key={h.date} className="autopast">
            <span>{day(h.date)}</span>
            <span className="autodots" aria-label={h.legs.map((l) => l.result ?? "pending").join(", ")}>
              {h.legs.map((l) => (
                <i key={`${l.player}|${l.stat}`} className={l.result ?? "open"} title={`${l.player} ${l.side === "OVER" ? "more" : "less"} than ${l.line}`} />
              ))}
            </span>
            <b className={h.result === "win" ? "pos" : h.result === "loss" ? "neg" : ""}>
              {h.result === "win" ? `Won ${h.multiplier}x` : h.result === "loss" ? "Lost" : h.result === "refund" ? "Refunded" : "Pending"}
            </b>
          </div>
        ))}
      </section>

      <p className="fine">
        Picks come from LayLock&apos;s model: recent games, the matchup, injuries and what the sportsbooks think. No pick is a sure thing.{" "}
        <Link href="/help">How it works</Link>
      </p>
    </div>
  );
}

function Leg({ l }: { l: AutoLeg }) {
  const live = !l.result && Date.parse(l.gameTime) < Date.now();
  return (
    <div className={`autoleg ${l.result ?? ""}`}>
      <div className="autolegmain">
        <strong>{l.player}</strong>
        <span className="autoline">
          <b className={l.side === "OVER" ? "pos" : "neg"}>{l.side === "OVER" ? "More" : "Less"}</b> than {l.line} {STATS[l.stat].label}
        </span>
        <small>
          {l.sport} · {l.team} vs {l.opponent} · {when(l.gameTime)}
        </small>
        {l.reasons[0] && <small className="autowhy">{l.reasons[0]}</small>}
      </div>
      <div className="autolegside">
        {l.result ? <span className={`potdresult ${l.result}`}>{RESULT[l.result]}</span> : live ? <span className="potdresult">Playing</span> : <strong>{pct(l.prob)}</strong>}
        {!l.result && !live && <small>chance</small>}
      </div>
    </div>
  );
}
