"use client";
// Promo calculator on the Sportsbook page: is this boost, bonus bet or no-sweat bet worth it, and how much?
// Tapping a price on the page fills in the bet and its fair odds.
import { useEffect, useState } from "react";
import { fmtAmerican, toAmerican } from "@/lib/books.ts";
import { bonusBet, chanceOf, hedgeBonus, noSweat, oddsBoost, profitBoost, type PromoResult } from "@/lib/promos.ts";
import { pct } from "@/lib/format.ts";

type Kind = "profit" | "odds" | "bonus" | "nosweat";
const KINDS: [Kind, string][] = [
  ["profit", "Profit boost"],
  ["odds", "Odds boost"],
  ["bonus", "Bonus bet"],
  ["nosweat", "No-sweat bet"],
];

export interface PromoSeed {
  label: string;
  /** The book's price (American). */
  price: number;
  /** LayLock's chance for the side. */
  fair: number;
}

const american = (v: string) => {
  const n = Number(v.replace("+", ""));
  return Number.isFinite(n) && Math.abs(n) >= 100 ? n : undefined;
};
const amount = (v: string) => Math.max(0, Number(v) || 0);
const money = (x: number) => `${x >= 0 ? "+" : "−"}$${Math.abs(x).toFixed(2)}`;

export default function PromoCalc({ seed }: { seed?: PromoSeed }) {
  const [kind, setKind] = useState<Kind>("profit");
  const [odds, setOdds] = useState("+150");
  const [fairOdds, setFairOdds] = useState("+160");
  const [stake, setStake] = useState("25");
  const [boost, setBoost] = useState("25");
  const [maxStake, setMaxStake] = useState("");
  const [boosted, setBoosted] = useState("+200");
  const [hedgeOdds, setHedgeOdds] = useState("");
  const [conversion, setConversion] = useState("70");

  useEffect(() => {
    if (!seed) return;
    setOdds(fmtAmerican(seed.price));
    setFairOdds(fmtAmerican(toAmerican(seed.fair)));
  }, [seed]);

  const o = american(odds);
  const f = american(fairOdds);
  const fair = f !== undefined ? chanceOf(f) : undefined;
  const s = amount(stake);
  let r: PromoResult | undefined;
  let hedge: ReturnType<typeof hedgeBonus> | undefined;
  if (o !== undefined && fair !== undefined && s > 0) {
    if (kind === "profit") r = profitBoost(o, amount(boost) / 100, s, fair, maxStake ? amount(maxStake) : Infinity);
    else if (kind === "odds") r = american(boosted) !== undefined ? oddsBoost(american(boosted)!, s, fair) : undefined;
    else if (kind === "bonus") r = bonusBet(o, s, fair);
    else r = noSweat(o, s, fair, s, amount(conversion) / 100);
  }
  if (kind === "bonus" && o !== undefined && american(hedgeOdds) !== undefined && s > 0) hedge = hedgeBonus(o, s, american(hedgeOdds)!);

  return (
    <section className="sbpromo">
      <h2>Promo calculator</h2>
      <small className="muted">
        Is the boost worth it? Tap any price above to fill in the bet; fair odds are LayLock&apos;s chance for that side.
        {seed ? ` Using: ${seed.label}.` : ""}
      </small>
      <div className="seg" role="group" aria-label="Promo type">
        {KINDS.map(([k, label]) => (
          <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)} aria-pressed={kind === k}>
            {label}
          </button>
        ))}
      </div>
      <div className="inputs promoinputs">
        <label>
          {kind === "odds" ? "Usual odds" : "Odds"}
          <input inputMode="numeric" value={odds} onChange={(e) => setOdds(e.target.value)} />
        </label>
        <label>
          Fair odds
          <input inputMode="numeric" value={fairOdds} onChange={(e) => setFairOdds(e.target.value)} />
        </label>
        <label>
          {kind === "bonus" ? "Bonus bet $" : "Stake $"}
          <input type="number" inputMode="decimal" min={0} value={stake} onChange={(e) => setStake(e.target.value)} />
        </label>
        {kind === "profit" && (
          <>
            <label>
              Boost %
              <input type="number" inputMode="decimal" min={0} value={boost} onChange={(e) => setBoost(e.target.value)} />
            </label>
            <label>
              Max stake $ (optional)
              <input type="number" inputMode="decimal" min={0} value={maxStake} onChange={(e) => setMaxStake(e.target.value)} />
            </label>
          </>
        )}
        {kind === "odds" && (
          <label>
            Boosted odds
            <input inputMode="numeric" value={boosted} onChange={(e) => setBoosted(e.target.value)} />
          </label>
        )}
        {kind === "bonus" && (
          <label>
            Hedge odds, other side (optional)
            <input inputMode="numeric" placeholder="e.g. −350" value={hedgeOdds} onChange={(e) => setHedgeOdds(e.target.value)} />
          </label>
        )}
        {kind === "nosweat" && (
          <label>
            Bonus bet worth %
            <input type="number" inputMode="decimal" min={0} max={100} value={conversion} onChange={(e) => setConversion(e.target.value)} />
          </label>
        )}
      </div>
      {fair !== undefined && <p className="fine">Fair odds {fairOdds} is a {pct(fair, 1)} chance.</p>}
      {r ? (
        <>
          <div className="stat">
            <span>Pays if it wins</span>
            <strong>${r.winProfit.toFixed(2)} profit</strong>
          </div>
          {kind === "profit" && (
            <div className="stat">
              <span>Really paying</span>
              <strong>{fmtAmerican(r.effective)}</strong>
            </div>
          )}
          <div className="stat big">
            <span>Expected value</span>
            <strong className={r.ev >= 0 ? "pos" : "neg"}>{money(r.ev)}</strong>
          </div>
          <p className={`verdict ${r.ev >= 0 ? "good" : "bad"}`}>
            {r.ev >= 0
              ? `✓ Worth it: ${pct(r.evPct, 1)} ${kind === "bonus" ? "of the bonus" : "of the stake"} back on average.`
              : `✗ Still a losing bet at this price, even with the promo. Try a side closer to fair odds.`}
          </p>
          {kind === "bonus" && <p className="fine">Bonus bets keep the most value at long odds: +300 to +600 usually turns about 70% of the bonus into cash.</p>}
        </>
      ) : (
        <p className="muted">Enter the odds, fair odds and stake.</p>
      )}
      {hedge && (
        <p className="note">
          Lock it in: bet ${hedge.hedge.toFixed(2)} cash on the other side at {hedgeOdds}. You make ${hedge.profit.toFixed(2)} either way, {pct(hedge.conversion)} of the
          bonus.
        </p>
      )}
    </section>
  );
}
