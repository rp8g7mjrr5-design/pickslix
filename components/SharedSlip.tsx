"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { pct } from "@/lib/format.ts";
import type { SharedSlip } from "@/lib/share.ts";
import { loadCustomProps, saveCustomProps } from "@/lib/storage.ts";
import { tailLegs } from "@/lib/tail.ts";
import { STATS } from "@/lib/types.ts";

/** A slip someone shared: the picks, the model's odds, and a button to copy it into your own slip. */
export default function SharedSlipView({ slip }: { slip: SharedSlip }) {
  const router = useRouter();
  const open = slip.legs.filter((l) => l.gameTime && Date.parse(l.gameTime) > Date.now()).length;

  const tail = () => {
    const { props, slip: legs, skipped } = tailLegs(slip.legs);
    const ids = new Set(props.map((p) => p.id));
    saveCustomProps([...props, ...loadCustomProps().filter((p) => !ids.has(p.id))]);
    try {
      localStorage.setItem("pickslix.slip", JSON.stringify(legs));
      sessionStorage.setItem(
        "pickslix.tailed",
        `Tailed ${slip.by ? `@${slip.by}'s` : "the"} slip${skipped ? ` (${skipped} pick${skipped === 1 ? "" : "s"} already started)` : ""}.`,
      );
    } catch {}
    router.push("/#slip");
  };

  return (
    <div className="sharedslip">
      <div className="hero">
        <div>
          <h1>{slip.by ? `@${slip.by}'s slip` : "Shared slip"}</h1>
          <p className="muted">
            {slip.legs.length} picks · shared {new Date(slip.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
        </div>
      </div>
      <section className="slip">
        {slip.legs.map((l, i) => (
          <div key={i} className="leg">
            <span className={`pill ${l.side === "OVER" ? "over" : "under"}`}>{l.side === "OVER" ? "More" : "Less"}</span>
            <div>
              <strong>{l.player}</strong>
              <small>
                {l.line} {STATS[l.stat]?.label ?? l.stat}
                {l.team && l.opponent ? ` · ${l.team} vs ${l.opponent}` : ""}
                {l.gameTime && Date.parse(l.gameTime) < Date.now() ? " · started" : ""}
              </small>
            </div>
            <span className="num">{pct(l.prob)}</span>
          </div>
        ))}
        {slip.hit !== undefined && (
          <div className="stat big">
            <span>Chance all hit</span>
            <strong>{pct(slip.hit, 1)}</strong>
          </div>
        )}
        <div className="actions">
          <button onClick={tail} disabled={!open}>
            {open ? `Tail ${open === slip.legs.length ? "this slip" : `the ${open} open picks`}` : "These games have started"}
          </button>
          <Link href="/" className="button ghost">
            Build my own
          </Link>
        </div>
        <p className="fine">Tailing copies the picks into your slip with fresh odds from the model. Nothing is placed for you.</p>
      </section>
    </div>
  );
}
