"use client";
// Ask LayLock: type a question about a player's line, get the model's read in plain English.
import { useState } from "react";
import type { Answer } from "@/lib/ask.ts";
import type { SlipLeg } from "@/lib/storage.ts";
import { STATS, type Prop } from "@/lib/types.ts";

interface Reply {
  answer?: Answer | null;
  list?: string | null;
  prop?: Prop | null;
  error?: string;
}

const EXAMPLES = ["Is Tatum's 27.5 points safe?", "Jokic over 11.5 rebounds", "Josh Allen pass yards"];

/** Same id the board gives a hand-entered line (lib/providers.ts). */
const propId = (player: string, stat: string) => `custom-${player}-${stat}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export default function Ask({ slip, onPick }: { slip: SlipLeg[]; onPick: (prop: Prop, side: "OVER" | "UNDER", prob: number) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);

  const ask = async (text = q) => {
    if (!text.trim()) return;
    setQ(text);
    setBusy(true);
    const r = (await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }) })
      .then((x) => x.json())
      .catch(() => ({ error: "Couldn't reach LayLock. Try again." }))) as Reply;
    setReply(r);
    setBusy(false);
  };

  const a = reply?.answer;
  const prop = reply?.prop ? { ...reply.prop, id: propId(reply.prop.player, reply.prop.stat) } : null;
  const added = a && prop && slip.some((l) => l.propId === prop.id && l.side === a.side);

  return (
    <section className="ask" aria-label="Ask LayLock">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about a player, like “Is Tatum's 27.5 safe?”" aria-label="Ask LayLock" maxLength={300} />
        <button type="submit" className="small" disabled={busy || !q.trim()}>
          {busy ? "…" : "Ask"}
        </button>
      </form>
      {!reply && (
        <div className="askexamples">
          {EXAMPLES.map((x) => (
            <button key={x} className="chip" onClick={() => ask(x)} disabled={busy}>
              {x}
            </button>
          ))}
        </div>
      )}
      {reply?.error && <p className="muted">{reply.error}</p>}
      {reply?.list && <p>{reply.list}</p>}
      {a && prop && (
        <div className="askanswer">
          <small className="muted">
            {prop.player} · {prop.line} {STATS[prop.stat].label}
            {prop.opponent ? ` vs ${prop.opponent}` : ""}
          </small>
          <strong>{a.headline}</strong>
          <ul>
            {a.lines.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {prop.gameTime && Date.parse(prop.gameTime) > Date.now() && (
            <button className={added ? "ghost small" : "small"} onClick={() => onPick(prop, a.side, a.prob)}>
              {added ? "On your slip ✓" : `Add ${a.side === "OVER" ? "More" : "Less"} to slip`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
