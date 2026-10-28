"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { usePro } from "@/lib/proClient.ts";
import { useAccount } from "@/components/Account";

const icons = {
  board: (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M13 8.5 11 12h2.5l-1.5 3.5" />
    </svg>
  ),
  tracker: (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19h16" />
      <path d="M7 15v-3M12 15V8M17 15v-5" />
    </svg>
  ),
  leaders: (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 6h3v1a3 3 0 0 1-3 3M7 6H4v1a3 3 0 0 0 3 3" />
    </svg>
  ),
  crews: (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M18 13.8c1.8.7 3 2.6 3 5.2" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  pro: (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z" />
    </svg>
  ),
};

const LINKS = [
  { href: "/", label: "Board", icon: icons.board, count: "slip" },
  { href: "/tracker", label: "Tracker", icon: icons.tracker, count: "open" },
] as const;

/** Picks in the slip being built, and saved picks still waiting on a result. */
function useCounts() {
  const [counts, setCounts] = useState({ slip: 0, open: 0 });
  useEffect(() => {
    const read = () => {
      try {
        const slip = JSON.parse(localStorage.getItem("pickslix.slip") ?? "[]") as unknown[];
        const saved = JSON.parse(localStorage.getItem("pickslix.slips") ?? "[]") as { legs: { result?: string }[] }[];
        setCounts({ slip: slip.length, open: saved.flatMap((s) => s.legs).filter((l) => !l.result).length });
      } catch {}
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("pickslix:change", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("pickslix:change", read);
    };
  }, []);
  return counts;
}

export default function Nav() {
  const path = usePathname();
  const counts = useCounts();
  const pro = usePro();
  // The Pro tab only shows once Pro is set up on this site.
  const showPro = Boolean(pro?.required);
  const account = useAccount();
  const extra = [
    // The site-wide leaderboard and Crews are separate tabs; each crew keeps its own standings inside Crews.
    ...(account.enabled
      ? [
          { href: "/crews", label: "Crews", icon: icons.crews },
          { href: "/leaderboard", label: "Leaders", icon: icons.leaders },
        ]
      : []),
    ...(account.admin ? [{ href: "/admin", label: "Admin", icon: icons.admin }] : []),
  ];
  return (
    <nav className="mainnav">
      {LINKS.map((l) => {
        const active = path === l.href;
        const n = counts[l.count];
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            {l.icon}
            <span className="navlabel">{l.label}</span>
            {n > 0 && (
              <b className="navcount" aria-label={l.count === "slip" ? `${n} in slip` : `${n} open picks`}>
                {n}
              </b>
            )}
          </Link>
        );
      })}
      {extra.map((l) => (
        <Link key={l.href} href={l.href} className={path.startsWith(l.href) ? "active" : ""} aria-current={path.startsWith(l.href) ? "page" : undefined}>
          {l.icon}
          <span className="navlabel">{l.label}</span>
        </Link>
      ))}
      {showPro && (
        <Link href="/pro" className={path === "/pro" ? "active" : ""} aria-current={path === "/pro" ? "page" : undefined}>
          {icons.pro}
          {pro?.pro ? <span className="probadge">PRO</span> : <span className="navlabel">Pro</span>}
        </Link>
      )}
    </nav>
  );
}
