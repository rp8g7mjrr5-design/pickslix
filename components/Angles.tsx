"use client";
// More ways into tonight's slate: lines that fit your own hot spots, and lines where the LayLock crowd and the
// model disagree. Shows only when there's something to say.
import { useEffect, useMemo, useState } from "react";
import { disagreements } from "@/lib/crowd.ts";
import { pct } from "@/lib/format.ts";
import { hotSpots, spotLines } from "@/lib/hotspots.ts";
import { useCrowd, useSlate } from "@/lib/slateClient.ts";
import type { LiteRow } from "@/lib/slateLite.ts";
import { loadSlips, type SlipLeg } from "@/lib/storage.ts";
import { STATS, type Prop } from "@/lib/types.ts";

/** Same id the board gives a hand-entered line (lib/providers.ts). */
const propId = (player: string, stat: string) => `custom-${player}-${stat}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const toProp = (r: LiteRow): Prop => ({ id: propId(r.player, r.stat), sport: r.sport, player: r.player, team: r.team, opponent: r.opponent, stat: r.stat, line: r.line, gameTime: r.gameTime });

const sideWord = (s: "OVER" | "UNDER") => (s === "OVER" ? "More" : "Less");

export default function Angles({ slip, onPick }: { slip: SlipLeg[]; onPick: (prop: Prop, side: "OVER" | "UNDER", prob: number) => void }) {
  const rows = useSlate();
  const counts = useCrowd();
  const [hot, setHot] = useState<ReturnType<typeof hotSpots>["hot"]>([]);
  useEffect(() => setHot(hotSpots(loadSlips()).hot), []);
  const mine = useMemo(() => spotLines(rows, hot), [rows, hot]);
  const crowd = useMemo(() => disagreements(rows, counts).slice(0, 3), [rows, counts]);
  if (!mine.length && !crowd.length) return null;

  const item = (r: LiteRow, side: "OVER" | "UNDER", prob: number, why: string) => {
    const prop = toProp(r);
    const added = slip.some((l) => l.propId === prop.id && l.side === side);
    return (
      <div key={`${r.id}:${why}`} className="edge">
        <div>
          <strong>{r.player}</strong>
          <span className="edgeline">
            <b className={side === "OVER" ? "pos" : "neg"}>{sideWord(side)}</b> than {r.line} {STATS[r.stat].label} · model {pct(prob)}
          </span>
          <small>{why}</small>
        </div>
        <button className={added ? "ghost small" : "small"} onClick={() => onPick(prop, side, prob)}>
          {added ? "Added ✓" : "Add"}
        </button>
      </div>
    );
  };

  return (
    <section className="edges angles" aria-label="More angles">
      {mine.length > 0 && (
        <>
          <div className="edgeshead">
            <h2>Your hot spots tonight</h2>
            <small className="muted">Lines that fit the picks you hit most, where the model agrees.</small>
          </div>
          {mine.map(({ row, spot }) => item(row, row.pick, row.pickProb, `You're ${pct(spot.rate)} on ${spot.label} (${spot.n} picks)`))}
        </>
      )}
      {crowd.length > 0 && (
        <>
          <div className="edgeshead">
            <h2>Crowd vs model</h2>
            <small className="muted">Most LayLock players went one way, the model the other.</small>
          </div>
          {crowd.map(({ row, crowd: c }) => item(row, row.pick, row.pickProb, `${pct(c.share)} of ${c.n} LayLock players took ${sideWord(c.side)}`))}
        </>
      )}
    </section>
  );
}
