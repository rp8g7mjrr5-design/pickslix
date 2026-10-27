"use client";

import { useEffect, useState } from "react";
import { slipHitProbability } from "@/lib/model.ts";
import { DEFAULT_MULTIPLIERS, pct } from "@/lib/format.ts";
import { persistSlips, pullSlips, type SlipLeg } from "@/lib/storage.ts";
import { STATS, type PropWithProjection } from "@/lib/types.ts";

export default function Slip({
  legs,
  rows,
  onRemove,
  onClear,
}: {
  legs: SlipLeg[];
  rows: PropWithProjection[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const [entry, setEntry] = useState(10);
  const [multiplier, setMultiplier] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const mult = multiplier ?? DEFAULT_MULTIPLIERS[legs.length] ?? 0;
  const hit = slipHitProbability(legs.map((l) => l.prob));
  const ev = legs.length >= 2 ? hit * mult * entry - entry : 0;
  const breakEven = mult > 0 ? Math.pow(1 / mult, 1 / Math.max(legs.length, 1)) : 0;

  // Legs from the same game tend to move together, so the multiplied chance overstates (or understates) it.
  const games = new Map<string, number>();
  for (const l of legs) {
    const r = rows.find((x) => x.id === l.propId);
    if (!r?.team || !r.opponent) continue;
    const key = [r.team, r.opponent].sort().join("-");
    games.set(key, (games.get(key) ?? 0) + 1);
  }
  const sameGame = [...games.values()].some((n) => n > 1);
  const outLegs = legs.filter((l) => rows.find((r) => r.id === l.propId)?.projection.status === "out");

  useEffect(() => {
    setMultiplier(null);
    setSaved(false);
  }, [legs.length]);

  const save = async () => {
    setSaved(true);
    // Pull first so a slip saved on another device isn't overwritten.
    const { slips } = await pullSlips();
    persistSlips([{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), entry, multiplier: mult, legs }, ...slips]);
  };

  const copy = async () => {
    const text = legs
      .map((l) => `${l.player}: ${l.side === "OVER" ? "More" : "Less"} than ${l.line} ${STATS[l.stat].label}`)
      .join("\n");
    await navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <aside className="slip" id="slip">
      <div className="sliphead">
        <h2>Your slip</h2>
        {legs.length > 0 && <span className="count">{legs.length}/6</span>}
      </div>
      {!legs.length && (
        <p className="muted">
          Tap a percentage on the board to add a pick, or upload a screenshot of an entry. Pick 6 takes 2 to 6 picks.
        </p>
      )}
      {legs.map((l) => (
        <div key={l.propId} className="leg">
          <span className={`pill ${l.side === "OVER" ? "over" : "under"}`}>{l.side === "OVER" ? "More" : "Less"}</span>
          <div>
            <strong>{l.player}</strong>
            <small>
              {l.line} {STATS[l.stat].label}
            </small>
          </div>
          <span className="num">{pct(l.prob)}</span>
          <button className="x" onClick={() => onRemove(l.propId)} aria-label={`Remove ${l.player}`}>
            ×
          </button>
        </div>
      ))}
      {legs.length > 0 && (
        <>
          <div className="stat big">
            <span>Chance all hit</span>
            <strong>{pct(hit, 1)}</strong>
          </div>
          <div className="inputs">
            <label>
              Entry $
              <input type="number" min={1} value={entry} onChange={(e) => setEntry(Number(e.target.value))} />
            </label>
            <label>
              Payout ×
              <input type="number" min={1} step={0.5} value={mult} onChange={(e) => setMultiplier(Number(e.target.value))} />
            </label>
          </div>
          {legs.length >= 2 && (
            <>
              <div className="stat">
                <span>Pays</span>
                <strong>${(entry * mult).toFixed(2)}</strong>
              </div>
              <div className="stat">
                <span>Expected value</span>
                <strong className={ev >= 0 ? "pos" : "neg"}>
                  {ev >= 0 ? "+" : "−"}${Math.abs(ev).toFixed(2)}
                </strong>
              </div>
              <p className="fine">Each pick needs about {pct(breakEven)} to break even at this payout.</p>
            </>
          )}
          {outLegs.length > 0 && (
            <p className="warn">{outLegs.map((l) => l.player).join(", ")} is listed out. That pick will likely be voided.</p>
          )}
          {sameGame && <p className="warn">Some picks are from the same game, so they're not independent. Treat the chance as rough.</p>}
          <p className="fine">Check the payout in the DraftKings app; it changes with the picks you choose.</p>
          <div className="actions">
            <button onClick={save} disabled={legs.length < 2 || saved}>
              {saved ? "Saved ✓" : "Save to tracker"}
            </button>
            <button className="ghost" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button className="ghost" onClick={onClear}>
              Clear
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
