"use client";

import { useEffect, useState } from "react";
import { pct } from "@/lib/format.ts";
import { loadSlips, persistSlips, pullSlips, setSyncCode, syncCode, type SavedSlip, type SlipLeg } from "@/lib/storage.ts";
import { STATS } from "@/lib/types.ts";

const RESULTS: NonNullable<SlipLeg["result"]>[] = ["hit", "miss", "push"];

export default function Tracker() {
  const [slips, setSlips] = useState<SavedSlip[]>([]);
  const [synced, setSynced] = useState(false);
  const load = () => {
    setSlips(loadSlips());
    pullSlips().then((r) => {
      setSynced(r.enabled);
      setSlips(r.slips);
    });
  };
  useEffect(load, []);

  const update = (next: SavedSlip[]) => {
    setSlips(next);
    persistSlips(next);
  };

  const mark = (slipId: string, propId: string, result: SlipLeg["result"]) =>
    update(
      slips.map((s) =>
        s.id !== slipId
          ? s
          : { ...s, legs: s.legs.map((l) => (l.propId === propId ? { ...l, result: l.result === result ? undefined : result } : l)) },
      ),
    );

  const graded = slips.flatMap((s) => s.legs).filter((l) => l.result === "hit" || l.result === "miss");
  const hits = graded.filter((l) => l.result === "hit").length;
  const expected = graded.reduce((a, l) => a + l.prob, 0);

  const settled = slips.filter((s) => s.legs.every((l) => l.result));
  const profit = settled.reduce((a, s) => {
    const live = s.legs.filter((l) => l.result !== "push");
    const won = live.length >= 2 && live.every((l) => l.result === "hit");
    return a + (won ? s.entry * s.multiplier - s.entry : -s.entry);
  }, 0);

  return (
    <div className="tracker">
      <div className="cards">
        <Card label="Picks graded" value={String(graded.length)} />
        <Card label="Your hit rate" value={graded.length ? pct(hits / graded.length) : "–"} />
        <Card label="Model expected" value={graded.length ? pct(expected / graded.length) : "–"} />
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
      {synced && <SyncCode onChange={load} />}
      {!slips.length && <p className="muted">No saved slips yet. Build one on the board and tap Save to tracker.</p>}
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
                  {l.side === "OVER" ? "More" : "Less"} than {l.line} {STATS[l.stat].label} · model {pct(l.prob)}
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
