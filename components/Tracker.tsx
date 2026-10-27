"use client";

import { useEffect, useRef, useState } from "react";
import { pct } from "@/lib/format.ts";
import { loadSlips, persistSlips, pullSlips, setSyncCode, syncCode, type SavedSlip, type SlipLeg } from "@/lib/storage.ts";
import { STATS } from "@/lib/types.ts";
import { unlocked, usePro } from "@/lib/proClient.ts";
import { SignInPrompt, useAccount } from "@/components/Account";

const RESULTS: NonNullable<SlipLeg["result"]>[] = ["hit", "miss", "push"];

export default function Tracker() {
  const [slips, setSlips] = useState<SavedSlip[]>([]);
  const pro = usePro();
  const [synced, setSynced] = useState(false);
  const [onAccount, setOnAccount] = useState(false);
  const account = useAccount();
  const [grading, setGrading] = useState(false);
  const [gradedNote, setGradedNote] = useState("");
  const graded = useRef(false);
  const load = () => {
    setSlips(loadSlips());
    pullSlips().then((r) => {
      setSynced(r.enabled);
      setOnAccount(r.account);
      setSlips(r.slips);
      if (!graded.current) {
        graded.current = true;
        autoGrade(r.slips);
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

  const settled = slips.filter((s) => s.legs.every((l) => l.result));
  const profit = settled.reduce((a, s) => {
    const live = s.legs.filter((l) => l.result !== "push");
    const won = live.length >= 2 && live.every((l) => l.result === "hit");
    return a + (won ? s.entry * s.multiplier - s.entry : -s.entry);
  }, 0);

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
        <Card
          label="Settled slips P/L"
          value={`${profit >= 0 ? "+" : "−"}$${Math.abs(profit).toFixed(2)}`}
          tone={profit >= 0 ? "pos" : "neg"}
        />
      </div>
      <p className="fine">
        Payouts on slips with a push are estimated as if the push leg were removed. Pick 6 may reduce the payout
        instead.
      </p>
      {settledLegs.length > 0 && <ReportCard legs={settledLegs} locked={!unlocked(pro)} />}
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
      {slips.map((s) => (
        <div key={s.id} className="saved">
          <div className="savedhead">
            <strong>
              {s.legs.length}-pick · ${s.entry} at {s.multiplier}×
            </strong>
            <small>{new Date(s.createdAt).toLocaleString()}</small>
            <button className="x" onClick={() => update(slips.filter((x) => x.id !== s.id))} aria-label="Delete slip">
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
      ))}
    </div>
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
  if (!locked) return card;
  return (
    <div className="prolock">
      <div className="blurred" aria-hidden>
        {card}
      </div>
      <div className="unlock">
        <strong>See how the model is really doing</strong>
        <small>The report card compares the model's odds with your actual results.</small>
        <a href="/pro">Unlock with Pro</a>
      </div>
    </div>
  );
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
