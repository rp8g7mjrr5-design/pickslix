"use client";
// "Live now": open picks whose games are on, with the stat so far against the line, refreshed every 30 seconds.
import { useEffect, useMemo, useState } from "react";
import type { LiveLeg } from "@/lib/live.ts";
import type { SavedSlip, SlipLeg } from "@/lib/storage.ts";
import { STATS } from "@/lib/types.ts";

/** Games that started within this long are worth checking. */
const WINDOW_MS = 6 * 3600_000;
const POLL_MS = 30_000;

const key = (l: SlipLeg) => `${l.player}|${l.stat}|${l.line}|${l.side}|${l.gameTime}`;

const LABEL: Record<LiveLeg["status"], string> = {
  waiting: "Not in yet",
  early: "Early",
  ahead: "On pace",
  behind: "Behind pace",
  cashed: "Cashed",
  busted: "Busted",
  hit: "Hit",
  miss: "Missed",
  push: "No action",
};
const TONE: Record<LiveLeg["status"], string> = {
  waiting: "",
  early: "",
  ahead: "good",
  behind: "bad",
  cashed: "good",
  busted: "bad",
  hit: "good",
  miss: "bad",
  push: "",
};

export function liveLegs(slips: SavedSlip[], now = Date.now()): SlipLeg[] {
  const seen = new Map<string, SlipLeg>();
  for (const s of slips)
    for (const l of s.legs) {
      const t = Date.parse(l.gameTime ?? "");
      if (!l.result && l.team && t <= now && now - t < WINDOW_MS && STATS[l.stat].sport !== "UFC") seen.set(key(l), l);
    }
  return [...seen.values()];
}

export default function LiveSweat({ slips }: { slips: SavedSlip[] }) {
  const [tick, setTick] = useState(() => Date.now());
  const legs = useMemo(() => liveLegs(slips, tick), [slips, tick]);
  const [live, setLive] = useState<Record<string, LiveLeg>>({});
  const [updated, setUpdated] = useState<number | null>(null);
  const want = legs.map(key).join(",");

  useEffect(() => {
    if (!legs.length) return;
    let stop = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            legs: legs.map((l) => ({ sport: l.sport ?? STATS[l.stat].sport, player: l.player, team: l.team, stat: l.stat, line: l.line, side: l.side, gameTime: l.gameTime })),
          }),
        });
        const { live: rows } = (await res.json()) as { live: (LiveLeg | null)[] };
        if (stop) return;
        const next: Record<string, LiveLeg> = {};
        legs.forEach((l, i) => rows[i] && (next[key(l)] = rows[i]!));
        setLive(next);
        setUpdated(Date.now());
      } catch {
        // Keep the last numbers; the next tick tries again.
      }
    };
    load();
    const id = setInterval(() => {
      setTick(Date.now());
      load();
    }, POLL_MS);
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);

  const rows = legs.map((l) => ({ leg: l, live: live[key(l)] })).filter((r) => r.live);
  if (!rows.length) return null;
  const winning = rows.filter((r) => TONE[r.live!.status] === "good").length;

  return (
    <section className="livesweat" aria-live="polite">
      <div className="reporthead">
        <h2>
          <span className="livedot" aria-hidden /> Live now
        </h2>
        <small>
          {winning} of {rows.length} looking good{updated ? ` · updated ${new Date(updated).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}
        </small>
      </div>
      <div className="livelist">
        {rows.map(({ leg, live: v }) => (
          <LiveCard key={key(leg)} leg={leg} v={v!} />
        ))}
      </div>
    </section>
  );
}

function LiveCard({ leg, v }: { leg: SlipLeg; v: LiveLeg }) {
  const value = v.value ?? 0;
  // The bar runs to a bit past the line (or the value, if it's already further), so the line sits at a fixed spot.
  const top = Math.max(leg.line * 1.4, value * 1.05, 1);
  const tone = TONE[v.status];
  return (
    <div className={`livecard ${tone}`}>
      <div className="livetop">
        <div>
          <strong>{leg.player}</strong>
          <small>
            <span className={leg.side === "OVER" ? "pos" : "neg"}>{leg.side === "OVER" ? "More" : "Less"}</span> than {leg.line} {STATS[leg.stat].label}
          </small>
        </div>
        <span className={`livechip ${tone}`}>{LABEL[v.status]}</span>
      </div>
      <div className="livebar" role="img" aria-label={`${v.value ?? "No"} ${STATS[leg.stat].label.toLowerCase()} so far, line ${leg.line}`}>
        <i style={{ width: `${Math.min(100, (value / top) * 100)}%` }} />
        {v.pace !== null && <em style={{ left: `${Math.min(100, (v.pace / top) * 100)}%` }} title={`Pace ${v.pace}`} />}
        <b style={{ left: `${(leg.line / top) * 100}%` }} />
      </div>
      <div className="livefoot">
        <span className="num">
          <strong>{v.value ?? "–"}</strong> / {leg.line}
          {v.pace !== null && <span className="muted"> · pace {v.pace}</span>}
        </span>
        <small className="muted">{[v.score, v.detail].filter(Boolean).join(" · ")}</small>
      </div>
    </div>
  );
}
