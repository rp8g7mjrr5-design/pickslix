"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "@/components/Account";
import { pct } from "@/lib/format.ts";
import { loadCustomProps, loadSlips, saveCustomProps, type SavedSlip } from "@/lib/storage.ts";
import { tailLegs, type TailLeg } from "@/lib/tail.ts";
import { STATS } from "@/lib/types.ts";

interface Leader {
  username: string;
  hitRate: number;
  picks: number;
  pro: boolean;
  gold?: boolean;
}
interface CrewSlip {
  id: string;
  createdAt: string;
  from: string;
  crew: string;
  legs: TailLeg[];
}

const WEEK = 7 * 86400_000;

/** This week's record from the slips saved on this device. */
function week(slips: SavedSlip[]) {
  const since = Date.now() - WEEK;
  const legs = slips.filter((s) => Date.parse(s.createdAt) > since).flatMap((s) => s.legs);
  const hits = legs.filter((l) => l.result === "hit").length;
  const misses = legs.filter((l) => l.result === "miss").length;
  // Streak: hits in a row, newest first, across all slips.
  let streak = 0;
  for (const l of slips.flatMap((s) => s.legs).filter((l) => l.result === "hit" || l.result === "miss")) {
    if (l.result !== "hit") break;
    streak++;
  }
  return { picks: legs.length, hits, misses, open: legs.filter((l) => !l.result).length, streak };
}

/** The cards under the board: your week, slips from your crews to tail, and the top of the leaderboard. */
export default function Pulse() {
  const account = useAccount();
  const [mine, setMine] = useState<ReturnType<typeof week> | null>(null);
  const [leaders, setLeaders] = useState<Leader[] | null>(null);
  const [crewSlips, setCrewSlips] = useState<CrewSlip[] | null>(null);
  const [hasCrew, setHasCrew] = useState(false);

  useEffect(() => {
    const read = () => setMine(week(loadSlips()));
    read();
    window.addEventListener("pickslix:change", read);
    return () => window.removeEventListener("pickslix:change", read);
  }, []);

  useEffect(() => {
    if (!account.enabled) return;
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setLeaders((d.rows ?? []).slice(0, 3)))
      .catch(() => setLeaders([]));
  }, [account.enabled]);

  useEffect(() => {
    if (!account.signedIn) return setCrewSlips(null);
    let live = true;
    (async () => {
      const { crews = [] } = await fetch("/api/crews").then((r) => r.json());
      setHasCrew(crews.length > 0);
      const found: CrewSlip[] = [];
      for (const c of crews.slice(0, 3)) {
        const d = await fetch(`/api/crews/${c.id}`).then((r) => r.json()).catch(() => null);
        for (const m of d?.members ?? []) {
          if (m.you) continue;
          for (const s of m.recent ?? []) {
            const open = (s.legs as TailLeg[]).filter((l) => l.gameTime && Date.parse(l.gameTime) > Date.now());
            if (open.length) found.push({ id: s.id, createdAt: s.createdAt, from: m.username, crew: c.name, legs: s.legs });
          }
        }
      }
      if (live) setCrewSlips(found.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3));
    })().catch(() => live && setCrewSlips([]));
    return () => {
      live = false;
    };
  }, [account.signedIn]);

  const tail = (s: CrewSlip) => {
    const { props, slip, skipped } = tailLegs(s.legs);
    if (!slip.length) return;
    const ids = new Set(props.map((p) => p.id));
    saveCustomProps([...props, ...loadCustomProps().filter((p) => !ids.has(p.id))]);
    try {
      localStorage.setItem("pickslix.slip", JSON.stringify(slip));
      sessionStorage.setItem("pickslix.tailed", `Tailed ${s.from}'s slip${skipped ? ` (${skipped} pick${skipped === 1 ? "" : "s"} already started)` : ""}.`);
    } catch {}
    window.location.hash = "slip";
    window.location.reload();
  };

  return (
    <section className="pulse" aria-label="Your week and your crews">
      <div className="pulsecard">
        <div className="pulsehead">
          <h2>Your week</h2>
          <Link href="/tracker">Tracker ›</Link>
        </div>
        {mine && mine.picks > 0 ? (
          <>
            <div className="pulsestats">
              <div>
                <strong>{mine.hits + mine.misses ? pct(mine.hits / (mine.hits + mine.misses)) : "–"}</strong>
                <small>hit rate</small>
              </div>
              <div>
                <strong>
                  {mine.hits}-{mine.misses}
                </strong>
                <small>record</small>
              </div>
              <div>
                <strong className={mine.streak >= 3 ? "pos" : ""}>{mine.streak}</strong>
                <small>{mine.streak >= 3 ? "🔥 in a row" : "hit streak"}</small>
              </div>
            </div>
            <small className="muted">
              {mine.picks} pick{mine.picks === 1 ? "" : "s"} saved this week{mine.open ? ` · ${mine.open} still to grade` : ""}
            </small>
          </>
        ) : (
          <p className="muted pulseempty">Save a slip and your record, hit rate and streaks show up here.</p>
        )}
      </div>

      {account.enabled && (
        <div className="pulsecard">
          <div className="pulsehead">
            <h2>From your crews</h2>
            <Link href="/crews">Crews ›</Link>
          </div>
          {!account.signedIn ? (
            <p className="muted pulseempty">Sign in and start a crew to see your friends' slips here and tail them in one tap.</p>
          ) : crewSlips === null ? (
            <div className="leader skeletoncard" aria-hidden />
          ) : crewSlips.length ? (
            <ul className="pulseslips">
              {crewSlips.map((s) => (
                <li key={s.id}>
                  <div>
                    <strong>{s.from}</strong>
                    <small>
                      {s.crew} · {s.legs.length} pick{s.legs.length === 1 ? "" : "s"}
                    </small>
                    <small className="pulselegs">
                      {s.legs
                        .slice(0, 3)
                        .map((l) => `${l.player.split(" ").slice(-1)[0]} ${l.side === "OVER" ? "More" : "Less"} ${l.line} ${STATS[l.stat]?.label ?? l.stat}`)
                        .join(" · ")}
                      {s.legs.length > 3 ? " …" : ""}
                    </small>
                  </div>
                  <button className="small" onClick={() => tail(s)}>
                    Tail
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted pulseempty">
              {hasCrew ? "No open slips from your crew right now. Check back before tonight's games." : "Start a crew with friends to see and tail each other's slips."}
            </p>
          )}
        </div>
      )}

      {account.enabled && (
        <div className="pulsecard">
          <div className="pulsehead">
            <h2>Top players</h2>
            <Link href="/leaderboard">Leaders ›</Link>
          </div>
          {leaders === null ? (
            <div className="leader skeletoncard" aria-hidden />
          ) : leaders.length ? (
            <ol className="pulseleaders">
              {leaders.map((l, i) => (
                <li key={l.username}>
                  <span className={`pulserank r${i + 1}`}>{i + 1}</span>
                  <strong>{l.username}</strong>
                  {l.pro && <span className={`probadge ${l.gold ? "gold" : ""}`}>PRO</span>}
                  <span className="num">{pct(l.hitRate)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted pulseempty">Nobody's ranked yet. Ten graded picks gets you on the board.</p>
          )}
        </div>
      )}
    </section>
  );
}
