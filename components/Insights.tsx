"use client";

import { pct } from "@/lib/format.ts";
import type { TeamEnv } from "@/lib/odds.ts";
import type { Projection, Split } from "@/lib/types.ts";

interface Market {
  line: number;
  pOver: number;
  books: number;
  sharp: boolean;
}

/** How often the line was cleared in games like this one. Lopsided splits over enough games are ringed. */
export function SplitChips({ splits }: { splits?: Split[] }) {
  if (!splits?.length) return null;
  return (
    <div className="splits" aria-label="How often this line was cleared">
      {splits.map((s) => {
        const share = s.n ? s.over / s.n : 0;
        const tone = share >= 0.6 ? "over" : s.n && s.under / s.n >= 0.6 ? "under" : "";
        return (
          <span
            key={s.key}
            className={`split ${tone} ${s.pattern ? "pattern" : ""}`}
            title={`${s.label}: over ${s.over}, under ${s.under}${s.n - s.over - s.under ? `, push ${s.n - s.over - s.under}` : ""}`}
          >
            <small>{s.label}</small>
            <strong className="num">
              {s.over}/{s.n}
            </strong>
          </span>
        );
      })}
    </div>
  );
}

/**
 * The sportsbooks' read next to the model's: their no-vig chance, whether Pick 6's line sits off theirs, and
 * how far the line has moved since we first saw it.
 */
export function MarketNote({
  market,
  open,
  line,
  posted,
  proj,
}: {
  market?: Market;
  open?: number;
  line: number;
  /** The line Pick 6 (or the stand-in book) posted. */
  posted?: number;
  proj: Projection | null;
}) {
  if (!market && open === undefined) return null;
  const side = proj?.pick === "UNDER" ? "Less" : "More";
  const gap = market ? market.line - line : 0;
  const agree = proj?.marketProb !== undefined && proj.marketProb > 0.53 && proj.pickProb > 0.53;
  return (
    <div className="market">
      {market && proj?.marketProb !== undefined && (
        <div className="marketrow">
          <span>
            <small>Books</small>
            <strong className="num">{pct(proj.marketProb)}</strong>
          </span>
          <span>
            <small>Model</small>
            <strong className="num">{pct(proj.pickProb)}</strong>
          </span>
          <span className="muted marketwho">
            {side} · {market.books} book{market.books === 1 ? "" : "s"}
            {market.sharp ? " incl. Pinnacle/BetOnline" : ""}
          </span>
          {agree && <b className="agree">Model + books agree</b>}
        </div>
      )}
      {market && gap !== 0 && (
        <small className={gap > 0 ? "pos" : "neg"}>
          Books are at {market.line}, {Math.abs(gap)} {gap > 0 ? "above" : "below"} this line, so {gap > 0 ? "More" : "Less"} is the easier side here.
        </small>
      )}
      {open !== undefined && posted !== undefined && open !== posted && (
        <small className="muted">
          Line moved {open} → {posted} since we first saw it{posted > open ? " (money on the over)" : " (money on the under)"}.
        </small>
      )}
    </div>
  );
}

const one = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** The game's total and spread, and what they leave this team to score. */
export function EnvNote({ env, team }: { env?: TeamEnv; team: string }) {
  if (!env) return null;
  const spread = env.spread === 0 ? "pick'em" : `${env.spread > 0 ? "+" : ""}${one(env.spread)}`;
  return (
    <small className="hint">
      Game total {one(env.total)} · {team} {spread} · implied {one(env.teamTotal)} for {team}, {one(env.oppTotal)} against
    </small>
  );
}
