"use client";

import { useEffect, useMemo, useState } from "react";
import { correlatedHitProbability } from "@/lib/correlation.ts";
import { DEFAULT_MULTIPLIERS, MAX_PICKS, pct } from "@/lib/format.ts";
import { persistSlips, pullSlips, type SlipLeg } from "@/lib/storage.ts";
import { STATS, type PropWithProjection } from "@/lib/types.ts";
import { unlocked, usePro } from "@/lib/proClient.ts";

const BEST_SIZES = [2, 3, 4, 5, 6];

export default function Slip({
  legs,
  rows,
  onRemove,
  onClear,
  onBest,
}: {
  legs: SlipLeg[];
  rows: PropWithProjection[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onBest: (n: number) => void;
}) {
  const pro = usePro();
  const [entry, setEntry] = useState(10);
  const [multiplier, setMultiplier] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const mult = multiplier ?? DEFAULT_MULTIPLIERS[legs.length] ?? 0;
  // Same-game picks move together, so the slip's chance is simulated rather than multiplied.
  const corr = useMemo(
    () =>
      correlatedHitProbability(
        legs.map((l) => {
          const r = rows.find((x) => x.id === l.propId);
          return { ...l, sport: r?.sport ?? l.sport, team: r?.team || l.team, opponent: r?.opponent || l.opponent };
        }),
      ),
    [legs, rows],
  );
  const hit = corr.prob;
  const ev = legs.length >= 2 && entry > 0 && mult > 0 ? hit * mult * entry - entry : 0;
  const breakEven = mult > 0 ? Math.pow(1 / mult, 1 / Math.max(legs.length, 1)) : 0;

  const linkedNote = corr.linked.length
    ? `${corr.linked
        .slice(0, 2)
        .map(([i, j]) => `${legs[i].player.split(" ").slice(-1)[0]} and ${legs[j].player.split(" ").slice(-1)[0]}`)
        .join(", ")}${corr.linked.length > 2 ? ` and ${corr.linked.length - 2} more` : ""}`
    : "";
  const outLegs = legs.filter((l) => rows.find((r) => r.id === l.propId)?.projection.status === "out");

  useEffect(() => {
    setMultiplier(null);
    setSaved(false);
  }, [legs.length]);

  const save = async () => {
    setSaved(true);
    // Pull first so a slip saved on another device isn't overwritten.
    const { slips } = await pullSlips();
    // Keep what the tracker needs to find each game later and grade it.
    const withGame = legs.map((l) => {
      const r = rows.find((x) => x.id === l.propId);
      return r ? { ...l, sport: r.sport, team: r.team || undefined, opponent: r.opponent || undefined, gameTime: r.gameTime } : l;
    });
    persistSlips([
      { id: crypto.randomUUID(), createdAt: new Date().toISOString(), entry, multiplier: mult, legs: withGame },
      ...slips,
    ]);
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
        {legs.length > 0 && <span className="count">{legs.length}/{MAX_PICKS}</span>}
      </div>
      {!legs.length && (
        <p className="muted">
          Tap a game at the top, pick a player, then tap More or Less. Your picks land here. Pick 6 takes 2 to {MAX_PICKS} picks.
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
            <span>
              Chance all hit <Tip text="The model's chance every pick on this slip wins. More picks pay more but hit less often." />
            </span>
            <strong>{pct(hit, 1)}</strong>
          </div>
          <div className="inputs">
            <label>
              Entry $
              <input
                type="number"
                inputMode="decimal"
                min={1}
                value={entry || ""}
                placeholder="10"
                onChange={(e) => setEntry(Math.max(0, Number(e.target.value) || 0))}
                onBlur={() => entry < 1 && setEntry(1)}
              />
            </label>
            <label>
              <span>
                Payout × <Tip text="What Pick 6 multiplies your entry by if every pick hits. It's shown in the DraftKings app before you submit." />
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={1}
                step={0.5}
                value={mult || ""}
                onChange={(e) => setMultiplier(Math.max(0, Number(e.target.value) || 0))}
                onBlur={() => mult < 1 && setMultiplier(DEFAULT_MULTIPLIERS[legs.length] ?? 1)}
              />
            </label>
          </div>
          {legs.length >= 2 && (
            <>
              <div className="stat">
                <span>Pays</span>
                <strong>${(entry * mult).toFixed(2)}</strong>
              </div>
              <div className="stat">
                <span>
                  Expected profit <Tip text="What you'd win or lose per entry on average if you played this slip many times. Positive is good." />
                </span>
                <strong className={ev >= 0 ? "pos" : "neg"}>
                  {ev >= 0 ? "+" : "−"}${Math.abs(ev).toFixed(2)}
                </strong>
              </div>
              {entry > 0 && mult > 0 && <p className={`verdict ${ev >= 0 ? "good" : "bad"}`}>
                {ev >= 0
                  ? "✓ Worth it: the model thinks this slip pays off over time."
                  : "✗ Not worth it at this payout. Try stronger picks (higher %) or fewer picks."}
              </p>}
              <p className="fine">Each pick needs about {pct(breakEven)} to break even at this payout.</p>
            </>
          )}
          {outLegs.length > 0 && (
            <p className="warn">{outLegs.map((l) => l.player).join(", ")} is listed out. That pick will likely be voided.</p>
          )}
          {corr.linked.length > 0 && (
            <p className={hit >= corr.independent ? "note" : "warn"}>
              {linkedNote} move together, so the chance is {pct(hit, 1)} rather than {pct(corr.independent, 1)} if they were unrelated.{" "}
              {hit >= corr.independent ? "Picks that rise and fall together help a slip." : "These picks pull against each other: one hitting makes the other less likely."}
            </p>
          )}
          <p className="fine">Check the payout in the DraftKings app; it changes with the picks you choose.</p>
          <div className="actions">
            {saved ? (
              <a className="button" href="/tracker">
                Saved ✓ View
              </a>
            ) : legs.length < 2 ? (
              <button disabled>Add 1 more pick</button>
            ) : (
              <button onClick={save}>Save to tracker</button>
            )}
            <button className="ghost" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button className="ghost" onClick={onClear}>
              Clear
            </button>
          </div>
        </>
      )}
      {rows.length > 0 && (
        <div className="bestslip">
          <div>
            <strong>
              <span aria-hidden>✦</span> Build my best slip
            </strong>
            <small>The model's strongest picks, one per game.</small>
          </div>
          {unlocked(pro) ? (
            <div className="seg" role="group" aria-label="Number of picks">
              {BEST_SIZES.map((n) => (
                <button key={n} onClick={() => onBest(n)} aria-label={`Best ${n}-pick slip`}>
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <a href="/pro" className="prolink">
              <span className="probadge">PRO</span> Unlock
            </a>
          )}
        </div>
      )}
    </aside>
  );
}

/** A small "?" that explains a term on tap or hover. */
export function Tip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="tip">
      <button
        type="button"
        className="tipbtn"
        aria-label="What's this?"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open && <span className="tipbox" role="tooltip">{text}</span>}
    </span>
  );
}
