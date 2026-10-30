"use client";

import { useEffect, useMemo, useState } from "react";
import { correlatedHitProbability } from "@/lib/correlation.ts";
import { pct } from "@/lib/format.ts";
import { PLATFORMS, breakEvenProb, expectedReturn, hasFlex, payoutTable, type PayoutTiers, type Play } from "@/lib/platforms.ts";
import { PlatformPicker, usePlatform } from "@/lib/platformClient.tsx";
import { persistSlips, pullSlips, type SlipLeg } from "@/lib/storage.ts";
import { STATS, type Prop, type PropWithProjection } from "@/lib/types.ts";
import { unlocked, usePro } from "@/lib/proClient.ts";
import { EntryCoach } from "@/components/Budget";
import { suggestPairs } from "@/lib/pairs.ts";
import { shareSlip } from "@/lib/shareClient.ts";
import { countForCrowd, useSlate } from "@/lib/slateClient.ts";

const BEST_SIZES = [2, 3, 4, 5, 6];

export default function Slip({
  legs,
  rows,
  onRemove,
  onClear,
  onBest,
  onAdd,
}: {
  legs: SlipLeg[];
  rows: PropWithProjection[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onBest: (n: number) => void;
  onAdd: (prop: Prop, side: "OVER" | "UNDER", prob: number) => void;
}) {
  const slate = useSlate();
  const pro = usePro();
  const [entry, setEntry] = useState(10);
  const platform = usePlatform();
  const app = PLATFORMS[platform];
  const MAX_PICKS = app.max;
  const [play, setPlay] = useState<Play>("power");
  const flexOk = hasFlex(platform, legs.length);
  const mode: Play = play === "flex" && flexOk ? "flex" : "power";
  // Hits → multiplier; edits override the app's standard table until the slip changes size or app.
  const [edits, setEdits] = useState<PayoutTiers | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const tiers: PayoutTiers = edits ?? payoutTable(platform, legs.length, mode);
  const mult = tiers[legs.length] ?? 0;
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
  // What a unit staked returns on average: only all-hit pays on a power play, a flex pays by hits.
  const ret = expectedReturn(corr.dist, tiers);
  // Lines from today's slate that move with this slip.
  const pairs = useMemo(() => {
    if (legs.length >= MAX_PICKS) return [];
    const withGame = legs.map((l) => {
      const r = rows.find((x) => x.id === l.propId) ?? slate.find((x) => x.player === l.player && x.stat === l.stat);
      return { ...l, sport: r?.sport ?? l.sport, team: r?.team || l.team, opponent: r?.opponent || l.opponent };
    });
    return suggestPairs(withGame, slate);
  }, [legs, rows, slate]);
  const ev = legs.length >= 2 && entry > 0 && mult > 0 ? (ret - 1) * entry : 0;
  const breakEven = mult > 0 ? breakEvenProb(legs.length, tiers) : 0;
  const tierList = Object.entries(tiers)
    .map(([k, v]) => [Number(k), v] as const)
    .sort((a, b) => b[0] - a[0]);

  const linkedNote = corr.linked.length
    ? `${corr.linked
        .slice(0, 2)
        .map(([i, j]) => `${legs[i].player.split(" ").slice(-1)[0]} and ${legs[j].player.split(" ").slice(-1)[0]}`)
        .join(", ")}${corr.linked.length > 2 ? ` and ${corr.linked.length - 2} more` : ""}`
    : "";
  const outLegs = legs.filter((l) => rows.find((r) => r.id === l.propId)?.projection.status === "out");

  useEffect(() => {
    setEdits(null);
    setSaved(false);
  }, [legs.length, platform, mode]);

  const save = async () => {
    setSaved(true);
    // Pull first so a slip saved on another device isn't overwritten.
    const { slips } = await pullSlips();
    // Keep what the tracker needs to find each game later and grade it.
    const withGame = legs.map((l) => {
      const r = rows.find((x) => x.id === l.propId);
      return r ? { ...l, sport: r.sport, team: r.team || undefined, opponent: r.opponent || undefined, gameTime: r.gameTime } : l;
    });
    const id = crypto.randomUUID();
    persistSlips([{ id, createdAt: new Date().toISOString(), entry, multiplier: mult, platform, play: mode, ...(mode === "flex" ? { tiers } : {}), legs: withGame }, ...slips]);
    countForCrowd(id, withGame);
  };

  const share = async () => {
    setShareNote("…");
    const withGame = legs.map((l) => {
      const r = rows.find((x) => x.id === l.propId);
      return r ? { ...l, sport: r.sport, team: r.team || undefined, opponent: r.opponent || undefined, gameTime: r.gameTime } : l;
    });
    const r = await shareSlip(withGame, hit);
    setShareNote(r.ok ? (r.how === "copied" ? "Link copied" : "Shared ✓") : r.error);
    setTimeout(() => setShareNote(""), 3000);
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
    // Nothing to show yet: on a phone the walkthrough and the games say it better, so this hides there.
    <aside className={`slip ${!legs.length && !rows.length ? "empty" : ""}`} id="slip">
      <div className="sliphead">
        <h2>Your slip</h2>
        {legs.length > 0 && <span className="count">{legs.length}/{MAX_PICKS}</span>}
      </div>
      <PlatformPicker />
      {!legs.length && (
        <p className="muted">
          {rows.length
            ? `Tap More or Less on a line to add it. ${app.name} takes ${app.min} to ${MAX_PICKS} picks.`
            : `Tap a game at the top, pick a player, then tap More or Less. ${app.name} takes ${app.min} to ${MAX_PICKS} picks.`}
        </p>
      )}
      {legs.map((l) => (
        <div key={l.propId} className="leg">
          <span className={`pill ${l.side === "OVER" ? "over" : "under"}`}>{l.side === "OVER" ? app.over : app.under}</span>
          <div>
            <strong>{l.player}</strong>
            <small>
              {l.line} {STATS[l.stat].label}
              {l.tier && app.alt && <b className={`alttag ${l.tier}`}>{l.tier === "below" ? app.alt.below : app.alt.above}</b>}
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
                {mode === "flex" ? "All hit pays ×" : "Payout ×"} <Tip text={`What ${app.name} multiplies your entry by if every pick hits. It's shown in the app before you submit.`} />
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={1}
                step={0.5}
                value={mult || ""}
                onChange={(e) => setEdits({ ...tiers, [legs.length]: Math.max(0, Number(e.target.value) || 0) })}
                onBlur={() => mult < 1 && setEdits(null)}
              />
            </label>
          </div>
          {app.flex && legs.length >= 2 && (
            <div className="seg playtoggle" role="group" aria-label="Play type">
              <button className={mode === "power" ? "on" : ""} onClick={() => setPlay("power")} aria-pressed={mode === "power"}>
                Power
              </button>
              <button className={mode === "flex" ? "on" : ""} onClick={() => setPlay("flex")} disabled={!flexOk} aria-pressed={mode === "flex"} title={flexOk ? undefined : `${app.flexName} needs ${Math.min(...Object.keys(app.flex).map(Number))}+ picks`}>
                {app.flexName}
              </button>
            </div>
          )}
          {mode === "flex" && tierList.length > 1 && (
            <div className="tiers" aria-label="Flex payouts">
              {tierList.map(([k, v]) => (
                <label key={k}>
                  {k}/{legs.length} ×
                  <input type="number" inputMode="decimal" min={0} step={0.05} value={v} onChange={(e) => setEdits({ ...tiers, [k]: Math.max(0, Number(e.target.value) || 0) })} />
                  <small>{pct(corr.dist[k] ?? 0)}</small>
                </label>
              ))}
            </div>
          )}
          {legs.length >= 2 && (
            <>
              {mode === "flex" && (
                <div className="stat">
                  <span>Chance it pays something</span>
                  <strong>{pct(tierList.reduce((a, [k, v]) => a + (v > 0 ? (corr.dist[k] ?? 0) : 0), 0), 1)}</strong>
                </div>
              )}
              <div className="stat">
                <span>{mode === "flex" ? "Pays if all hit" : "Pays"}</span>
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
              {/* Flex: sized as a power play with the same average return, close enough for a quarter-Kelly stake. */}
              <EntryCoach hit={mode === "flex" ? ret / mult : hit} mult={mult} entry={entry} onUse={setEntry} />
            </>
          )}
          {legs.some((l) => l.tier) && (
            <p className="note">
              {app.alt ? `${app.alt.below}s pay less and ${app.alt.above}s pay more than standard picks.` : "Alternate lines change the payout."} Set the payout{" "}
              {app.name} shows for this slip.
            </p>
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
          {pairs.length > 0 && (
            <div className="pairs">
              <strong>Pairs well with this slip</strong>
              <small className="muted">These move with your picks, so they lift the chance more than an unrelated pick would.</small>
              {pairs.map((p) => {
                const prop: Prop = {
                  id: `custom-${p.row.player}-${p.row.stat}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                  sport: p.row.sport, player: p.row.player, team: p.row.team, opponent: p.row.opponent, stat: p.row.stat, line: p.row.line, gameTime: p.row.gameTime,
                };
                return (
                  <div key={p.row.id} className="pair">
                    <span>
                      <b className={p.side === "OVER" ? "pos" : "neg"}>{p.side === "OVER" ? "More" : "Less"}</b> {p.row.player} {p.row.line} {STATS[p.row.stat].label}
                      <small>
                        {pct(p.prob)} · moves with {p.with.split(" ").slice(-1)[0]}
                      </small>
                    </span>
                    <button className="ghost small" onClick={() => onAdd(prop, p.side, p.prob)}>
                      Add
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="fine">{app.payoutNote}</p>
          {shareNote.length >= 16 && <p className="warn">{shareNote}</p>}
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
            {legs.length >= 2 && (
              <button className="ghost" onClick={share} disabled={shareNote === "…"}>
                {shareNote && shareNote !== "…" && shareNote.length < 16 ? shareNote : "Share"}
              </button>
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
