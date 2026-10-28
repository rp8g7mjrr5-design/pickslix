"use client";
// The pick of the day card at the top of the Board, with its public record.
import { useEffect, useState } from "react";
import { pct } from "@/lib/format.ts";
import type { Potd, PotdRecord } from "@/lib/potd.ts";
import type { SlipLeg } from "@/lib/storage.ts";
import { STATS, type Prop } from "@/lib/types.ts";

interface Data {
  pick: Potd | null;
  record: PotdRecord;
}

/** Same id the board gives a hand-entered line (lib/providers.ts), so the pick lands on the board like any other. */
const propId = (player: string, stat: string) => `custom-${player}-${stat}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

export default function PickOfDay({ slip, onPick }: { slip: SlipLeg[]; onPick: (prop: Prop, side: "OVER" | "UNDER", prob: number) => void }) {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    fetch("/api/potd")
      .then((r) => r.json() as Promise<Data>)
      .then(setData)
      .catch(() => {});
  }, []);
  const p = data?.pick;
  if (!p) return null;
  const r = data!.record;
  const decided = r.hits + r.misses;
  const prop: Prop = { id: propId(p.player, p.stat), sport: p.sport, player: p.player, team: p.team, opponent: p.opponent, stat: p.stat, line: p.line, gameTime: p.gameTime };
  const added = slip.some((l) => l.propId === prop.id && l.side === p.side);
  const started = Date.parse(p.gameTime) < Date.now();
  return (
    <section className="potd" aria-label="Pick of the day">
      <div className="potdhead">
        <span className="potdlabel">Pick of the day</span>
        {decided > 0 && (
          <span className="potdrecord" title="Every pick of the day, graded from the box score">
            {r.hits}–{r.misses} · {pct(r.hits / decided)}
            {r.streak >= 2 ? ` · ${r.streak} straight` : ""}
          </span>
        )}
      </div>
      <div className="potdbody">
        <div>
          <strong className="potdplayer">{p.player}</strong>
          <span className="potdline">
            <b className={p.side === "OVER" ? "pos" : "neg"}>{p.side === "OVER" ? "More" : "Less"}</b> than {p.line} {STATS[p.stat].label}
          </span>
          <small>
            {p.team} vs {p.opponent} · {when(p.gameTime)} · model {pct(p.prob)}
            {p.marketProb !== undefined ? ` · books ${pct(p.marketProb)}` : ""}
          </small>
          {p.reasons[0] && <small className="potdwhy">{p.reasons[0]}</small>}
        </div>
        {p.result ? (
          <span className={`potdresult ${p.result}`}>{p.result === "hit" ? "Hit ✓" : p.result === "miss" ? "Missed" : "Push"}</span>
        ) : started ? (
          <span className="potdresult">Locked</span>
        ) : (
          <button className={added ? "ghost" : ""} onClick={() => onPick(prop, p.side, p.prob)}>
            {added ? "On your slip ✓" : "Add to slip"}
          </button>
        )}
      </div>
    </section>
  );
}
