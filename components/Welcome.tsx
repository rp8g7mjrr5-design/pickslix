"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SEEN = "pickslix.welcomed";

/** A one-time "here's how this works" card for first visits. */
export default function Welcome() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(!localStorage.getItem(SEEN));
    } catch {}
  }, []);
  if (!show) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(SEEN, "1");
    } catch {}
    setShow(false);
  };
  return (
    <section className="welcome" aria-label="How it works">
      <div className="welcomehead">
        <strong>New here? It takes 30 seconds.</strong>
        <button className="x" onClick={dismiss} aria-label="Close">
          ×
        </button>
      </div>
      <ol>
        <li>
          <b>1</b>
          <span>
            <strong>Tap a game</strong> below, then a player.
          </span>
        </li>
        <li>
          <b>2</b>
          <span>
            <strong>Match the line</strong> to what DraftKings Pick 6 shows. The green <em>Model pick</em> is the side we like.
          </span>
        </li>
        <li>
          <b>3</b>
          <span>
            <strong>Tap More or Less</strong> to add picks. Your slip shows if it's worth playing.
          </span>
        </li>
      </ol>
      <div className="welcomeactions">
        <button onClick={dismiss}>Got it</button>
        <Link href="/help" onClick={dismiss}>
          How it works
        </Link>
      </div>
    </section>
  );
}
