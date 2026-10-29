"use client";
// Where Pick 6 is behind right now: soft lines (the books have moved, Pick 6 hasn't) and injury ripples (a starter
// is out and his teammates' lines haven't caught up). Sits under the pick of the day on the Board.
import Link from "next/link";
import { useEffect, useState } from "react";
import { pct } from "@/lib/format.ts";
import type { Edge } from "@/lib/edges.ts";
import type { SoftRecord } from "@/lib/softRecord.ts";
import { getProKey, proHeaders } from "@/lib/proClient.ts";
import type { SlipLeg } from "@/lib/storage.ts";
import { STATS, type Prop } from "@/lib/types.ts";

interface Data {
  soft: Edge[];
  softCount: number;
  ripple: Edge[];
  locked: boolean;
  record: SoftRecord | null;
}

/** "34–21 (62%) on soft lines, last 30 days" */
export function RecordPill({ record }: { record: SoftRecord }) {
  return (
    <span className="softrecord" title="Every soft line we flagged, graded from the box score">
      <b>
        {record.hits}–{record.misses}
      </b>{" "}
      ({pct(record.rate!)}) on soft lines, last 30 days
    </span>
  );
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
  const hidden = data.softCount - data.soft.length;
  return (
    <section className="edges" id="edges" aria-label="Where Pick 6 is behind">
      <div className="edgeshead">
        <h2>Where Pick 6 is behind</h2>
        <small className="muted">Lines the books or the injury report have moved past. They tend not to last.</small>
        {data.record && <RecordPill record={data.record} />}
      </div>
      {items.map((e) => {
        const prop: Prop = { id: propId(e.player, e.stat), sport: e.sport, player: e.player, team: e.team, opponent: e.opponent, stat: e.stat, line: e.line, gameTime: e.gameTime };
        const added = slip.some((l) => l.propId === prop.id && l.side === e.side);
        return (
          <div key={e.id} className="edge">
            <div>
              <span className="edgetags">
                <span className={`edgetag ${e.kind}`}>{e.kind === "soft" ? "Soft line" : "Injury ripple"}</span>
                {data.locked && e.kind === "soft" && <span className="edgetag free">Free today</span>}
              </span>
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
      {data.locked && hidden > 0 && (
        <div className="softlocked">
          {/* Stand-in rows under a blur: the real ones stay on the server. */}
          <div className="softblur" aria-hidden>
            {Array.from({ length: Math.min(hidden, 3) }, (_, i) => (
              <div key={i} className="edge">
                <div>
                  <span className="edgetag soft">Soft line</span>
                  <strong>{["Player Name", "Another Player", "Third Player"][i]}</strong>
                  <span className="edgeline">More than 00.5 Points</span>
                  <small>books 61% · model 58% · AAA vs BBB</small>
                </div>
                <span className="button small">Add</span>
              </div>
            ))}
          </div>
          <div className="softcta">
            <strong>
              {hidden} more soft line{hidden === 1 ? "" : "s"} right now
            </strong>
            <small>Pro shows every one, and can buzz your phone the moment one opens up.</small>
            <Link href="/pro" className="button small">
              Unlock with Pro
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
