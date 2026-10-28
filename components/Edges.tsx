"use client";
// Where Pick 6 is behind right now: soft lines (the books have moved, Pick 6 hasn't) and injury ripples (a starter
// is out and his teammates' lines haven't caught up). Sits under the pick of the day on the Board.
import Link from "next/link";
import { useEffect, useState } from "react";
import { pct } from "@/lib/format.ts";
import type { Edge } from "@/lib/edges.ts";
import { getProKey, proHeaders } from "@/lib/proClient.ts";
import type { SlipLeg } from "@/lib/storage.ts";
import { STATS, type Prop } from "@/lib/types.ts";

interface Data {
  soft: Edge[];
  softCount: number;
  ripple: Edge[];
  locked: boolean;
}

/** Same id the board gives a hand-entered line (lib/providers.ts). */
const propId = (player: string, stat: string) => `custom-${player}-${stat}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

export default function Edges({ slip, onPick }: { slip: SlipLeg[]; onPick: (prop: Prop, side: "OVER" | "UNDER", prob: number) => void }) {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    const load = () =>
      fetch("/api/edges", { headers: proHeaders() })
        .then((r) => r.json() as Promise<Data>)
        .then(setData)
        .catch(() => {});
    load();
    // Unlocking Pro shows them without a reload.
    let key = getProKey();
    const onChange = () => {
      if (getProKey() === key) return;
      key = getProKey();
      load();
    };
    window.addEventListener("pickslix:change", onChange);
    return () => window.removeEventListener("pickslix:change", onChange);
  }, []);
  if (!data || (!data.softCount && !data.ripple.length)) return null;
  const items = [...data.soft, ...data.ripple];
  return (
    <section className="edges" id="edges" aria-label="Where Pick 6 is behind">
      <div className="edgeshead">
        <h2>Where Pick 6 is behind</h2>
        <small className="muted">Lines the books or the injury report have moved past. They tend not to last.</small>
      </div>
      {items.map((e) => {
        const prop: Prop = { id: propId(e.player, e.stat), sport: e.sport, player: e.player, team: e.team, opponent: e.opponent, stat: e.stat, line: e.line, gameTime: e.gameTime };
        const added = slip.some((l) => l.propId === prop.id && l.side === e.side);
        return (
          <div key={e.id} className="edge">
            <div>
              <span className={`edgetag ${e.kind}`}>{e.kind === "soft" ? "Soft line" : "Injury ripple"}</span>
              <strong>{e.player}</strong>
              <span className="edgeline">
                <b className={e.side === "OVER" ? "pos" : "neg"}>{e.side === "OVER" ? "More" : "Less"}</b> than {e.line} {STATS[e.stat].label}
              </span>
              <small>
                {e.kind === "soft"
                  ? `${e.booksLine !== undefined && e.booksLine !== e.line ? `Books at ${e.booksLine} · ` : ""}books ${pct(e.booksProb!)} · model ${pct(e.prob)}`
                  : `${e.outPlayer} is out · +${Math.round((e.boost ?? 0) * 100)}% usage · model ${pct(e.prob)}`}
                {` · ${e.team} vs ${e.opponent} · ${when(e.gameTime)}`}
              </small>
            </div>
            <button className={added ? "ghost small" : "small"} onClick={() => onPick(prop, e.side, e.prob)}>
              {added ? "Added ✓" : "Add"}
            </button>
          </div>
        );
      })}
      {data.locked && data.softCount > 0 && (
        <div className="edge locked">
          <div>
            <span className="edgetag soft">Soft line{data.softCount === 1 ? "" : "s"}</span>
            <strong>
              {data.softCount} Pick 6 line{data.softCount === 1 ? " is" : "s are"} behind the books right now
            </strong>
            <small>Pro shows which ones, and can buzz your phone the moment one opens up.</small>
          </div>
          <Link href="/pro" className="button small">
            See them
          </Link>
        </div>
      )}
    </section>
  );
}
