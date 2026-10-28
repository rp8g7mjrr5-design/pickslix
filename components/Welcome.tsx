"use client";
// The first-visit walkthrough: three steps that follow what the person actually does (tap a game, tap a
// player and pick a side, save the slip), pointing at the right spot on the page each time.
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadSlips } from "@/lib/storage.ts";

const DONE = "pickslix.coach";
/** Set by the old one-card welcome; anyone who closed it has seen the basics. */
const OLD = "pickslix.welcomed";

const seen = () => {
  try {
    return Boolean(localStorage.getItem(DONE) || localStorage.getItem(OLD));
  } catch {
    return true;
  }
};

export default function Welcome({ gameOpen, picks }: { gameOpen: boolean; picks: number }) {
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const start = loadSlips().length;
    // Someone with saved slips already knows the way around.
    setShow(!seen() && start === 0);
    const onChange = () => loadSlips().length > start && setSaved(true);
    window.addEventListener("pickslix:change", onChange);
    return () => window.removeEventListener("pickslix:change", onChange);
  }, []);

  const step = saved ? 4 : picks > 0 ? 3 : gameOpen ? 2 : 1;

  // Point at what to tap next (the styles key off this class).
  useEffect(() => {
    if (!show) return;
    document.body.dataset.coach = String(step);
    return () => {
      delete document.body.dataset.coach;
    };
  }, [show, step]);

  if (!show) return null;
  const finish = () => {
    try {
      localStorage.setItem(DONE, "1");
    } catch {}
    setShow(false);
  };

  const text =
    step === 1 ? (
      <>
        <strong>Tap a game</strong> to see who's playing.
      </>
    ) : step === 2 ? (
      <>
        <strong>Tap a player</strong>, match the line to Pick 6, then tap <strong>More</strong> or <strong>Less</strong>. The green <em>Model pick</em> is the side we like.
      </>
    ) : step === 3 ? (
      picks < 2 ? (
        <>
          Nice. <strong>Add one more pick</strong> (Pick 6 needs at least 2), then tap <strong>Save to tracker</strong>.
        </>
      ) : (
        <>
          Check the verdict on your slip, then tap <strong>Save to tracker</strong>.
        </>
      )
    ) : (
      <>
        <strong>You're set.</strong> Your picks grade themselves on the Tracker after each game.
      </>
    );

  return (
    <aside className={`coach ${picks > 0 ? "raised" : ""}`} role="status" aria-live="polite">
      <div className="coachtop">
        <span className="coachstep">{step < 4 ? `Step ${step} of 3` : "Done"}</span>
        <span className="coachdots" aria-hidden>
          {[1, 2, 3].map((n) => (
            <i key={n} className={n < step ? "done" : n === step ? "on" : ""} />
          ))}
        </span>
        <button className="x" onClick={finish} aria-label="Close walkthrough">
          ×
        </button>
      </div>
      <p>{text}</p>
      <div className="coachactions">
        {step === 4 ? (
          <>
            <Link href="/tracker" className="button" onClick={finish}>
              Open Tracker
            </Link>
            <button className="ghost" onClick={finish}>
              Done
            </button>
          </>
        ) : (
          <>
            <button className="linkish" onClick={finish}>
              Skip tour
            </button>
            <Link href="/help" className="linkish" onClick={finish}>
              How it works
            </Link>
          </>
        )}
      </div>
    </aside>
  );
}
