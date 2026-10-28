"use client";

import { useEffect, useState } from "react";
import type { AccuracyReport } from "@/lib/accuracy.ts";
import { applyTune, type Calibration, type Tune } from "@/lib/calibration.ts";
import { pct } from "@/lib/format.ts";

/** Fewer graded picks than this and the page says it's early. */
const EARLY = 100;

/** Public proof that the percentages mean something: when the model says 60%, do those picks hit about 60%? */
export default function Accuracy() {
  const [report, setReport] = useState<(AccuracyReport & { at: string; tune?: Calibration | null }) | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/accuracy")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setReport)
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="accuracy">
      <section className="prohero">
        <h1>Model accuracy</h1>
        <p className="muted">
          Every pick saved on LayLock, graded from the box score, next to the chance the model gave it. Hand-marked results and picks
          saved after a game started don't count, and a pick many people played counts once.
        </p>
      </section>
      {failed && <p className="banner">Couldn't load the report card right now.</p>}
      {!report && !failed && <p className="muted">Loading…</p>}
      {report && (
        <>
          <div className="accstats">
            <span>
              <small>Graded picks</small>
              <strong className="num">{report.picks}</strong>
            </span>
            <span>
              <small>Hit rate</small>
              <strong className="num">{report.picks ? pct(report.hits / report.picks) : "—"}</strong>
            </span>
            <span>
              <small>Brier score</small>
              <strong className="num">{report.brier === null ? "—" : report.brier.toFixed(3)}</strong>
            </span>
          </div>
          <p className="fine">
            Brier score measures how close the model's chances were to what happened: 0.250 is a coin flip, lower is better.
            {report.picks < EARLY ? ` Only ${report.picks} graded picks so far, so this is early.` : ""}
          </p>
          <section className="report">
            <div className="reporthead">
              <h2>When the model said…</h2>
              <small>Bars are how often those picks hit; the tick is what the model expected.</small>
            </div>
            <div className="buckets">
              {report.buckets.map((b) => {
                const rate = b.n ? b.hits / b.n : 0;
                return (
                  <div key={b.label} className="bucket">
                    <small>Model said {b.label}</small>
                    <div className="bucketbar" aria-hidden>
                      <i style={{ width: `${rate * 100}%` }} className={b.n && rate >= b.expected ? "good" : "meh"} />
                      {b.n > 0 && <b style={{ left: `${b.expected * 100}%` }} title="Expected" />}
                    </div>
                    <span className="num">
                      {b.n ? (
                        <>
                          <strong>{pct(rate)}</strong> hit <span className="muted">of {b.n} · expected {pct(b.expected)}</span>
                        </>
                      ) : (
                        <span className="muted">No picks yet</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {report.bySport.length > 0 && (
              <p className="fine">
                {report.bySport.map((s) => `${s.sport}: ${pct(s.hits / s.n)} hit of ${s.n} (expected ${pct(s.expected)})`).join(" · ")}
              </p>
            )}
          </section>
          {report.tune && <Tuning cal={report.tune} />}
          <p className="fine">Updated {new Date(report.at).toLocaleString()}. Rebuilt every hour.</p>
        </>
      )}
    </div>
  );
}

/** What a tune does to a 60% pick on each side, in words. */
function tuneLine(label: string, t: Tune) {
  const over = applyTune(0.6, t);
  const under = 1 - applyTune(0.4, t);
  const same = Math.abs(over - 0.6) < 0.005 && Math.abs(under - 0.6) < 0.005;
  return (
    <li key={label}>
      <strong>{label}</strong>
      <span className="muted">
        {same ? "No change yet" : `A 60% over now shows ${pct(over)}, a 60% under ${pct(under)}`} · {t.n} picks
      </span>
    </li>
  );
}

/** How the model has adjusted itself from these results. */
function Tuning({ cal }: { cal: Calibration }) {
  return (
    <section className="report">
      <div className="reporthead">
        <h2>Self-tuning</h2>
        <small>Rebuilt daily from these results</small>
      </div>
      <p className="fine">
        The model learns from its own graded picks. When a sport's picks hit less often than it said, its chances get pulled in; when overs
        or unders keep beating it, it leans that way. It moves slowly, so a hot or cold week doesn't swing it.
      </p>
      <ul className="tunelist">
        {tuneLine("All sports", cal.all)}
        {Object.entries(cal.sports).map(([sport, t]) => t && tuneLine(sport, t))}
      </ul>
    </section>
  );
}
