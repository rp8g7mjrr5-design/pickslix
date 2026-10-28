"use client";

import { useEffect, useRef, useState } from "react";
import { pct } from "@/lib/format.ts";
import { loadSlips, persistSlips, pullSlips, setSyncCode, syncCode, type SavedSlip, type SlipLeg } from "@/lib/storage.ts";
import { STATS } from "@/lib/types.ts";
import { clvSummary, legClv } from "@/lib/clv.ts";
import { shareSlip } from "@/lib/shareClient.ts";
import { unlocked, usePro } from "@/lib/proClient.ts";
import { SignInPrompt, useAccount } from "@/components/Account";
import { AlertsToggle } from "@/components/Alerts";

const RESULTS: NonNullable<SlipLeg["result"]>[] = ["hit", "miss", "push"];

type Filter = "all" | "open" | "settled";

/** A settled slip's result and profit. A push leg is treated as removed. */
function outcome(s: SavedSlip): { state: "open" | "won" | "lost"; pnl: number } {
  if (!s.legs.every((l) => l.result)) return { state: "open", pnl: 0 };
  const live = s.legs.filter((l) => l.result !== "push");
  const won = live.length >= 2 && live.every((l) => l.result === "hit");
  return { state: won ? "won" : "lost", pnl: won ? s.entry * s.multiplier - s.entry : -s.entry };
}

const money = (x: number) => `${x >= 0 ? "+" : "−"}$${Math.abs(x).toFixed(2)}`;

export default function Tracker() {
  const [slips, setSlips] = useState<SavedSlip[]>([]);
  const pro = usePro();
  const [synced, setSynced] = useState(false);
  const [onAccount, setOnAccount] = useState(false);
  const account = useAccount();
  const [grading, setGrading] = useState(false);
  const [gradedNote, setGradedNote] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const graded = useRef(false);
  const load = () => {
    setSlips(loadSlips());
    pullSlips().then((r) => {
      setSynced(r.enabled);
      setOnAccount(r.account);
      setSlips(r.slips);
      if (!graded.current) {
        graded.current = true;
        autoGrade(r.slips).then(fetchCloses);
      }
    });
  };
  useEffect(load, []);
  // Signing in or out swaps whose slips these are.
  useEffect(() => {
    const reload = () => load();
    window.addEventListener("pickslix:account", reload);
    return () => window.removeEventListener("pickslix:account", reload);
  }, []);

  /** Grade every open leg whose game should be over, from the box scores. */
  const autoGrade = async (current: SavedSlip[]) => {
    const now = Date.now();
    const open = current.flatMap((s) =>
      s.legs
        .filter((l) => !l.result && now > Date.parse(l.gameTime ?? s.createdAt) + 3 * 3600_000)
        .map((l) => ({ slipId: s.id, leg: l, savedAt: s.createdAt })),
    );
    if (!open.length) return;
    setGrading(true);
    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legs: open.slice(0, 60).map(({ leg, savedAt }) => ({
            player: leg.player, stat: leg.stat, line: leg.line, side: leg.side,
            sport: leg.sport, team: leg.team, gameTime: leg.gameTime, savedAt,
          })),
        }),
      });
      const { results } = (await res.json()) as { results: (SlipLeg["result"] | null)[] };
      const found = new Map<string, NonNullable<SlipLeg["result"]>>();
      open.slice(0, 60).forEach((o, i) => results[i] && found.set(`${o.slipId}|${o.leg.propId}`, results[i]!));
      if (!found.size) return;
      // Re-read so a mark made while grading isn't lost.
      const latest = loadSlips();
      const next = latest.map((s) => ({
        ...s,
        legs: s.legs.map((l) => {
          const r = found.get(`${s.id}|${l.propId}`);
          return r && !l.result ? { ...l, result: r, auto: true } : l;
        }),
      }));
      setSlips(next);
      persistSlips(next);
      setGradedNote(`Graded ${found.size} pick${found.size === 1 ? "" : "s"} from box scores.`);
    } catch {
      // Leave legs open; the next visit tries again.
    } finally {
      setGrading(false);
    }
  };

  /** Closing prices for picks that had a sportsbook price when saved and whose games have started. */
  const fetchCloses = async () => {
    const now = Date.now();
    const current = loadSlips();
    const want = current.flatMap((s) =>
      s.legs
        .filter((l) => l.openPrice && !l.closePrice && l.gameTime && Date.parse(l.gameTime) < now && now - Date.parse(l.gameTime) < 4 * 86400_000)
        .map((l) => ({ slipId: s.id, leg: l })),
    );
    if (!want.length) return;
    try {
      const res = await fetch("/api/clv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legs: want.slice(0, 100).map(({ leg }) => ({ sport: leg.sport ?? STATS[leg.stat].sport, player: leg.player, stat: leg.stat, gameTime: leg.gameTime })),
        }),
      });
      const { closes } = (await res.json()) as { closes: ({ line: number; pOver: number } | null)[] };
      const found = new Map<string, { line: number; pOver: number }>();
      want.slice(0, 100).forEach((w, i) => closes[i] && found.set(`${w.slipId}|${w.leg.propId}`, closes[i]!));
      if (!found.size) return;
      const next = loadSlips().map((s) => ({
        ...s,
        legs: s.legs.map((l) => (found.has(`${s.id}|${l.propId}`) && !l.closePrice ? { ...l, closePrice: found.get(`${s.id}|${l.propId}`) } : l)),
      }));
      setSlips(next);
      persistSlips(next);
    } catch {
      // Try again next visit.
    }
  };

  const update = (next: SavedSlip[]) => {
    setSlips(next);
    persistSlips(next);
  };

  const mark = (slipId: string, propId: string, result: SlipLeg["result"]) =>
    update(
      slips.map((s) =>
        s.id !== slipId
          ? s
          : {
              ...s,
              legs: s.legs.map((l) =>
                l.propId === propId ? { ...l, result: l.result === result ? undefined : result, auto: false } : l,
              ),
            },
      ),
    );

  const settledLegs = slips.flatMap((s) => s.legs).filter((l) => l.result === "hit" || l.result === "miss");
  const hits = settledLegs.filter((l) => l.result === "hit").length;
  const expected = settledLegs.reduce((a, l) => a + l.prob, 0);

  const settled = slips.filter((s) => outcome(s).state !== "open");
  const profit = settled.reduce((a, s) => a + outcome(s).pnl, 0);
  const openCount = slips.length - settled.length;
  const clv = clvSummary(slips);
  const shown = slips.filter((s) => filter === "all" || (filter === "open") === (outcome(s).state === "open"));
  const locked = !unlocked(pro);

  const remove = (s: SavedSlip) => {
    if (!confirm(`Delete this ${s.legs.length}-pick slip? This can't be undone.`)) return;
    update(slips.filter((x) => x.id !== s.id));
  };

  return (
    <div className="tracker">
      <div className="hero">
        <div>
          <h1>Tracker</h1>
          <p className="muted">
            {grading
              ? "Checking box scores…"
              : gradedNote || "Picks grade themselves from box scores after each game. Tap a result to fix one."}
          </p>
        </div>
      </div>
      <div className="cards">
        <Card label="Picks graded" value={String(settledLegs.length)} />
        <Card label="Your hit rate" value={settledLegs.length ? pct(hits / settledLegs.length) : "–"} />
        <Card label="Model expected" value={settledLegs.length ? pct(expected / settledLegs.length) : "–"} />
        <Card label="Settled slips P/L" value={money(profit)} tone={profit >= 0 ? "pos" : "neg"} />
      </div>
      {openCount > 0 && <AlertsToggle />}
      {clv.n > 0 && (
        <div className="clvbar">
          <span>
            <small>Beat the closing line</small>
            <strong className={clv.beat >= clv.lost ? "pos" : "neg"}>
              {clv.beat} of {clv.n}
            </strong>
          </span>
          <span>
            <small>Average line move</small>
            <strong className={clv.avg >= 0 ? "pos" : "neg"}>
              {clv.avg >= 0 ? "+" : "−"}
              {Math.abs(clv.avg * 100).toFixed(1)} pts
            </strong>
          </span>
          <small className="clvwhy">
            How far the sportsbooks moved toward your picks between when you saved them and the start. Sharp bettors beat the close
            more often than not, even through losing streaks.
          </small>
        </div>
      )}
      <p className="fine">
        Payouts on slips with a push are estimated as if the push leg were removed. Pick 6 may reduce the payout
        instead.
      </p>
      {settled.length > 0 && <Insights slips={settled} locked={locked} />}
      {settledLegs.length > 0 && <ReportCard legs={settledLegs} locked={locked} />}
      {account.enabled && account.loaded && !account.signedIn && (
        <div className="signinprompt">
          <small>Sign in to keep your slips and results on every device.</small>
          <SignInPrompt>Sign in</SignInPrompt>
        </div>
      )}
      {synced && !onAccount && !account.enabled && <SyncCode onChange={load} />}
      {!slips.length && (
        <div className="emptycard">
          <p>No saved slips yet. Build one on the board and tap Save to tracker.</p>
        </div>
      )}
      {slips.length > 0 && (
        <div className="trackbar">
          <div className="seg" role="tablist" aria-label="Show slips">
            {(
              [
                ["all", `All ${slips.length}`],
                ["open", `Open ${openCount}`],
                ["settled", `Settled ${settled.length}`],
              ] as [Filter, string][]
            ).map(([f, label]) => (
              <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {label}
              </button>
            ))}
          </div>
          {locked ? (
            <a href="/pro" className="prolink">
              <span className="probadge">PRO</span> Export CSV
            </a>
          ) : (
            <button className="ghost small" onClick={() => exportCsv(slips)}>
              Export CSV
            </button>
          )}
        </div>
      )}
      {slips.length > 0 && !shown.length && <p className="muted empty">No {filter} slips.</p>}
      {shown.map((s) => {
        const o = outcome(s);
        const done = s.legs.filter((l) => l.result).length;
        return (
          <div key={s.id} className={`saved ${o.state}`}>
            <div className="savedhead">
              <strong>
                {s.legs.length}-pick · ${s.entry} at {s.multiplier}×
              </strong>
              <small>{new Date(s.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small>
              <span className={`result ${o.state}`}>
                {o.state === "open" ? `${done}/${s.legs.length} in` : `${o.state === "won" ? "Won" : "Lost"} ${money(o.pnl)}`}
              </span>
              <ShareButton slip={s} />
              <button className="x" onClick={() => remove(s)} aria-label="Delete slip">
                ×
              </button>
            </div>
            {s.legs.map((l) => (
              <div key={l.propId} className="leg">
                <div>
                  <strong>{l.player}</strong>
                  <small>
                    {l.auto && <b className="autotag" title="Graded from the box score">auto</b>}
                    <span className={l.side === "OVER" ? "pos" : "neg"}>{l.side === "OVER" ? "More" : "Less"}</span> than {l.line}{" "}
                    {STATS[l.stat].label} · model {pct(l.prob)}
                    <ClvTag leg={l} />
                  </small>
                </div>
                <div className="grade">
                  {RESULTS.map((r) => (
                    <button key={r} className={l.result === r ? `on ${r}` : ""} onClick={() => mark(s.id, l.propId, r)}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Share link for a saved slip, so friends can see it and tail the picks still open. */
function ShareButton({ slip }: { slip: SavedSlip }) {
  const [note, setNote] = useState("");
  const go = async () => {
    setNote("…");
    const r = await shareSlip(slip.legs);
    setNote(r.ok ? (r.how === "copied" ? "Copied" : "✓") : "!");
    setTimeout(() => setNote(""), 2500);
  };
  return (
    <button className="ghost small sharebtn" onClick={go} disabled={note === "…"} aria-label="Share slip" title="Share slip">
      {note || (
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
        </svg>
      )}
    </button>
  );
}

/** "Line moved your way" for one pick, once the closing price is in. */
function ClvTag({ leg }: { leg: SlipLeg }) {
  const c = legClv(leg);
  if (!c) return null;
  const way = c.diff >= 0.005 ? "pos" : c.diff <= -0.005 ? "neg" : "muted";
  return (
    <span className={`clvtag ${way}`} title={`Books had your side at ${pct(c.open)} when you saved it and ${pct(c.close)} at the close`}>
      {" "}· close {pct(c.open)}→{pct(c.close)}
      {way === "pos" ? " ✓" : ""}
    </span>
  );
}

const BUCKETS: [number, number, string][] = [
  [0, 0.55, "Under 55%"],
  [0.55, 0.6, "55–60%"],
  [0.6, 0.65, "60–65%"],
  [0.65, 1.01, "65%+"],
];

/** Did picks the model liked more actually hit more? Buckets settled legs by the model's chance. */
function ReportCard({ legs, locked }: { legs: SlipLeg[]; locked: boolean }) {
  const rows = BUCKETS.map(([lo, hi, label]) => {
    const inB = legs.filter((l) => l.prob >= lo && l.prob < hi);
    const hit = inB.filter((l) => l.result === "hit").length;
    const exp = inB.reduce((a, l) => a + l.prob, 0);
    return { label, n: inB.length, rate: inB.length ? hit / inB.length : 0, exp: inB.length ? exp / inB.length : 0 };
  });
  const bySport = new Map<string, { n: number; hit: number }>();
  for (const l of legs) {
    const s = l.sport ?? STATS[l.stat].sport;
    const e = bySport.get(s) ?? { n: 0, hit: 0 };
    e.n += 1;
    e.hit += l.result === "hit" ? 1 : 0;
    bySport.set(s, e);
  }
  const total = legs.length;
  const card = (
    <section className="report">
      <div className="reporthead">
        <h2>Model report card</h2>
        <small>{total < 30 ? `Only ${total} graded picks so far, so treat this as early.` : `${total} graded picks.`}</small>
      </div>
      <div className="buckets">
        {rows.map((r) => (
          <div key={r.label} className="bucket">
            <small>Model said {r.label}</small>
            <div className="bucketbar" aria-hidden>
              <i style={{ width: `${r.rate * 100}%` }} className={r.n && r.rate >= r.exp ? "good" : "meh"} />
              {r.n > 0 && <b style={{ left: `${r.exp * 100}%` }} title="Expected" />}
            </div>
            <span className="num">
              {r.n ? (
                <>
                  <strong>{pct(r.rate)}</strong> hit <span className="muted">of {r.n} · expected {pct(r.exp)}</span>
                </>
              ) : (
                <span className="muted">No picks yet</span>
              )}
            </span>
          </div>
        ))}
      </div>
      {bySport.size > 1 && (
        <p className="fine">
          {[...bySport.entries()].map(([s, e]) => `${s} ${pct(e.hit / e.n)} of ${e.n}`).join(" · ")}
        </p>
      )}
    </section>
  );
  return (
    <ProLock locked={locked} title="See how the model is really doing" detail="The report card compares the model's odds with your actual results.">
      {card}
    </ProLock>
  );
}

function ProLock({ locked, title, detail, children }: { locked: boolean; title: string; detail: string; children: React.ReactNode }) {
  if (!locked) return children;
  return (
    <div className="prolock">
      <div className="blurred" aria-hidden>
        {children}
      </div>
      <div className="unlock">
        <strong>{title}</strong>
        <small>{detail}</small>
        <a href="/pro">Unlock with Pro</a>
      </div>
    </div>
  );
}

/** Profit over time, ROI, and where the user's picks do best. */
function Insights({ slips, locked }: { slips: SavedSlip[]; locked: boolean }) {
  const ordered = [...slips].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let run = 0;
  const points = [0, ...ordered.map((s) => (run += outcome(s).pnl))];
  const staked = ordered.reduce((a, s) => a + s.entry, 0);
  const won = ordered.filter((s) => outcome(s).state === "won").length;
  let streak = 0;
  for (let i = ordered.length - 1; i >= 0 && outcome(ordered[i]).state === outcome(ordered[ordered.length - 1]).state; i--) streak++;
  const lastWon = outcome(ordered[ordered.length - 1]).state === "won";

  const legs = ordered.flatMap((s) => s.legs).filter((l) => l.result === "hit" || l.result === "miss");
  const rate = (ls: SlipLeg[]) => (ls.length ? ls.filter((l) => l.result === "hit").length / ls.length : 0);
  const more = legs.filter((l) => l.side === "OVER");
  const less = legs.filter((l) => l.side === "UNDER");
  const byStat = new Map<string, SlipLeg[]>();
  for (const l of legs) byStat.set(STATS[l.stat].label, [...(byStat.get(STATS[l.stat].label) ?? []), l]);
  const stats = [...byStat.entries()].filter(([, ls]) => ls.length >= 3).map(([label, ls]) => ({ label, n: ls.length, rate: rate(ls) }));
  stats.sort((a, b) => b.rate - a.rate);
  const best = stats.slice(0, 3);
  const worst = stats.length > 3 ? stats.slice(-2).reverse() : [];

  const card = (
    <section className="report insights">
      <div className="reporthead">
        <h2>Your insights</h2>
        <small>
          {won}-{ordered.length - won} on settled slips · ROI {staked ? `${((run / staked) * 100).toFixed(0)}%` : "–"} · {streak} {lastWon ? "win" : "loss"}
          {streak === 1 ? "" : lastWon ? "s" : "es"} in a row
        </small>
      </div>
      <ProfitChart points={points} />
      <div className="insightgrid">
        <div>
          <small>More picks</small>
          <strong>{more.length ? pct(rate(more)) : "–"}</strong>
          <span className="muted">of {more.length}</span>
        </div>
        <div>
          <small>Less picks</small>
          <strong>{less.length ? pct(rate(less)) : "–"}</strong>
          <span className="muted">of {less.length}</span>
        </div>
      </div>
      {best.length > 0 && (
        <div className="statlist">
          <small>Your best stats</small>
          {best.map((x) => (
            <span key={x.label}>
              {x.label} <b className="pos">{pct(x.rate)}</b> <span className="muted">of {x.n}</span>
            </span>
          ))}
          {worst.length > 0 && <small>Toughest for you</small>}
          {worst.map((x) => (
            <span key={x.label}>
              {x.label} <b className="neg">{pct(x.rate)}</b> <span className="muted">of {x.n}</span>
            </span>
          ))}
        </div>
      )}
      {!best.length && <p className="fine">Stat breakdowns show up once a stat has 3 graded picks.</p>}
    </section>
  );
  return (
    <ProLock locked={locked} title="Know where you win" detail="Profit over time, ROI, streaks, and your best and worst stats.">
      {card}
    </ProLock>
  );
}

function ProfitChart({ points }: { points: number[] }) {
  const w = 600;
  const h = 120;
  const lo = Math.min(0, ...points);
  const hi = Math.max(0, ...points);
  const span = hi - lo || 1;
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * w : w / 2);
  const y = (v: number) => h - 6 - ((v - lo) / span) * (h - 12);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= 0;
  return (
    <svg className="profitchart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Profit over ${points.length - 1} settled slips`}>
      <line x1="0" x2={w} y1={y(0)} y2={y(0)} className="zero" />
      <path d={`${d} L${x(points.length - 1)} ${y(0)} L0 ${y(0)} Z`} className={up ? "fillpos" : "fillneg"} />
      <path d={d} className={up ? "pos" : "neg"} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function exportCsv(slips: SavedSlip[]) {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Saved", "Slip", "Entry", "Payout", "Slip result", "Slip P/L", "Player", "Stat", "Line", "Pick", "Model chance", "Result"]];
  for (const s of slips) {
    const o = outcome(s);
    for (const l of s.legs) {
      rows.push([
        s.createdAt, s.id.slice(0, 8), String(s.entry), String(s.multiplier), o.state, o.state === "open" ? "" : o.pnl.toFixed(2),
        l.player, STATS[l.stat].label, String(l.line), l.side === "OVER" ? "More" : "Less", (l.prob * 100).toFixed(1) + "%", l.result ?? "",
      ]);
    }
  }
  const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `laylock-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Card({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card">
      <small>{label}</small>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function SyncCode({ onChange }: { onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const code = syncCode();
  if (!editing) {
    return (
      <div className="sync">
        <small>Slips sync to any device using this code:</small>
        <code>{code}</code>
        <button className="ghost" onClick={() => navigator.clipboard?.writeText(code)}>
          Copy
        </button>
        <button className="ghost" onClick={() => setEditing(true)}>
          Use another code
        </button>
      </div>
    );
  }
  return (
    <form
      className="sync"
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^[a-z0-9-]{12,64}$/i.test(value.trim())) return;
        setSyncCode(value);
        setEditing(false);
        onChange();
      }}
    >
      <input placeholder="Paste the code from your other device" value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="submit">Switch</button>
      <button type="button" className="ghost" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </form>
  );
}
