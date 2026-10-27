"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { slipHitProbability } from "@/lib/model.ts";
import { DEFAULT_MULTIPLIERS, pct } from "@/lib/format.ts";
import { loadCustomProps, persistSlips, pullSlips, saveCustomProps, type SlipLeg } from "@/lib/storage.ts";
import { STATS, type Prop, type PropWithProjection, type Sport, type StatKey } from "@/lib/types.ts";

const propId = (player: string, stat: string) => `custom-${player}-${stat}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const gameTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

type SportFilter = "ALL" | Sport;

export default function Board() {
  const [rows, setRows] = useState<PropWithProjection[]>([]);
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState<SportFilter>("ALL");
  const [query, setQuery] = useState("");
  const [minEdge, setMinEdge] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [slip, setSlip] = useState<SlipLeg[]>([]);
  const [panel, setPanel] = useState<"paste" | "add" | null>(null);
  const [mineCount, setMineCount] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    const custom = loadCustomProps();
    setMineCount(custom.length);
    const [base, mine] = await Promise.all([
      fetch("/api/props").then((r) => r.json()),
      custom.length
        ? fetch("/api/props", { method: "POST", body: JSON.stringify({ props: custom }) }).then((r) => r.json())
        : Promise.resolve({ board: [] }),
    ]);
    const byId = new Map<string, PropWithProjection>();
    for (const r of [...base.board, ...mine.board]) byId.set(r.id, r);
    setRows([...byId.values()].sort((a, b) => b.projection.edge - a.projection.edge));
    setProvider(base.provider);
    setLoading(false);
    // Live data starts with an empty board: open the paste box.
    if (!base.board.length && !custom.length) setPanel("paste");
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (sport === "ALL" || r.sport === sport) &&
          r.projection.edge >= minEdge &&
          (!query || `${r.player} ${r.team} ${r.opponent}`.toLowerCase().includes(query.toLowerCase())),
      ),
    [rows, sport, query, minEdge],
  );

  const toggleLeg = (r: PropWithProjection, side: "OVER" | "UNDER") => {
    setSlip((s) => {
      const existing = s.find((l) => l.propId === r.id);
      const rest = s.filter((l) => l.propId !== r.id);
      if (existing?.side === side) return rest;
      if (!existing && s.length >= 6) return s;
      const prob = side === "OVER" ? r.projection.pOver : r.projection.pUnder;
      return [...rest, { propId: r.id, player: r.player, stat: r.stat, line: r.line, side, prob }];
    });
  };

  return (
    <div className="layout">
      <section>
        <div className="toolbar">
          <div className="tabs">
            {(["ALL", "NBA", "NFL"] as SportFilter[]).map((s) => (
              <button key={s} className={sport === s ? "active" : ""} onClick={() => setSport(s)}>
                {s === "ALL" ? "All" : s}
              </button>
            ))}
          </div>
          <input placeholder="Search player or team" value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="edge">
            Min edge
            <select value={minEdge} onChange={(e) => setMinEdge(Number(e.target.value))}>
              <option value={0}>Any</option>
              <option value={0.05}>5%+</option>
              <option value={0.1}>10%+</option>
              <option value={0.15}>15%+</option>
            </select>
          </label>
          <button className="ghost" onClick={() => setPanel((v) => (v === "paste" ? null : "paste"))}>
            {panel === "paste" ? "Close" : "Paste lines"}
          </button>
          <button className="ghost" onClick={() => setPanel((v) => (v === "add" ? null : "add"))}>
            {panel === "add" ? "Close" : "+ Add line"}
          </button>
          {mineCount > 0 && (
            <button
              className="ghost"
              onClick={() => {
                if (!confirm(`Remove your ${mineCount} pasted/added lines?`)) return;
                saveCustomProps([]);
                refresh();
              }}
            >
              Clear my lines
            </button>
          )}
        </div>

        {provider === "sample" && (
          <p className="banner">
            Showing sample lines and generated stats (DATA_SOURCE=sample). Remove that setting to use live ESPN stats.
          </p>
        )}

        {panel === "paste" && <PasteLines onAdded={refresh} />}
        {panel === "add" && <AddLine onAdded={refresh} />}

        {loading ? (
          <p className="muted">Crunching numbers…</p>
        ) : (
          <div className="table">
            <div className="row head">
              <span>Player</span>
              <span>Prop</span>
              <span>Line</span>
              <span>Proj</span>
              <span>Over</span>
              <span>Under</span>
              <span>Last 10</span>
            </div>
            {visible.map((r) => {
              const p = r.projection;
              const leg = slip.find((l) => l.propId === r.id);
              return (
                <div key={r.id} className={`rowwrap ${p.status === "out" ? "out" : ""}`}>
                  <div className="row" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <span>
                      <strong>{r.player}</strong>
                      <small className="mobile-only">{STATS[r.stat].label}</small>
                      <small>
                        {r.sport} · {r.team}
                        {r.opponent ? ` vs ${r.opponent}` : ""}
                        {r.gameTime ? ` · ${gameTimeLabel(r.gameTime)}` : ""}
                      </small>
                    </span>
                    <span>{STATS[r.stat].label}</span>
                    <span className="num">{r.line}</span>
                    <span className="num">{p.mean.toFixed(1)}</span>
                    <SideButton
                      prob={p.pOver}
                      best={p.pick === "OVER"}
                      selected={leg?.side === "OVER"}
                      onClick={() => toggleLeg(r, "OVER")}
                    />
                    <SideButton
                      prob={p.pUnder}
                      best={p.pick === "UNDER"}
                      selected={leg?.side === "UNDER"}
                      onClick={() => toggleLeg(r, "UNDER")}
                    />
                    <Spark values={r.recent} line={r.line} />
                  </div>
                  {open === r.id && (
                    <div className="detail">
                      <span className={`conf ${p.confidence}`}>{p.confidence} confidence</span>
                      <span className="muted">
                        Lean {p.pick} {pct(p.pickProb)} · hit {pct(p.hitRateLast10)} of last 10
                      </span>
                      <ul>
                        {p.reasons.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
            {!visible.length && (
              <p className="muted">
                {rows.length ? "No props match these filters." : "No lines yet. Paste today's Pick 6 lines above to score them."}
              </p>
            )}
          </div>
        )}
      </section>
      <Slip legs={slip} onRemove={(id) => setSlip((s) => s.filter((l) => l.propId !== id))} onClear={() => setSlip([])} />
    </div>
  );
}

function SideButton(props: { prob: number; best: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button
      className={`side ${props.best ? "best" : ""} ${props.selected ? "selected" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
    >
      {pct(props.prob)}
    </button>
  );
}

function Spark({ values, line }: { values: number[]; line: number }) {
  const max = Math.max(line * 1.6, ...values, 1);
  // Oldest on the left
  const ordered = [...values].reverse();
  return (
    <span className="spark" title={ordered.join(", ")}>
      {ordered.map((v, i) => (
        <i key={i} className={v > line ? "over" : "under"} style={{ height: `${Math.max(6, (v / max) * 100)}%` }} />
      ))}
      <b style={{ bottom: `${(line / max) * 100}%` }} />
    </span>
  );
}

function Slip({ legs, onRemove, onClear }: { legs: SlipLeg[]; onRemove: (id: string) => void; onClear: () => void }) {
  const [entry, setEntry] = useState(10);
  const [multiplier, setMultiplier] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const mult = multiplier ?? DEFAULT_MULTIPLIERS[legs.length] ?? 0;
  const hit = slipHitProbability(legs.map((l) => l.prob));
  const ev = legs.length >= 2 ? hit * mult * entry - entry : 0;

  useEffect(() => {
    setMultiplier(null);
    setSaved(false);
  }, [legs.length]);

  const save = async () => {
    setSaved(true);
    // Pull first so a slip saved on another device isn't overwritten.
    const { slips } = await pullSlips();
    persistSlips([{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), entry, multiplier: mult, legs }, ...slips]);
  };

  return (
    <aside className="slip">
      <h2>Your slip</h2>
      {!legs.length && <p className="muted">Tap an over or under percentage to add a pick. Pick 6 needs 2 to 6.</p>}
      {legs.map((l) => (
        <div key={l.propId} className="leg">
          <div>
            <strong>{l.player}</strong>
            <small>
              {l.side === "OVER" ? "More" : "Less"} than {l.line} {STATS[l.stat].label}
            </small>
          </div>
          <span className="num">{pct(l.prob)}</span>
          <button className="x" onClick={() => onRemove(l.propId)} aria-label="Remove">
            ×
          </button>
        </div>
      ))}
      {legs.length > 0 && (
        <>
          <div className="stat">
            <span>All legs hit</span>
            <strong>{pct(hit, 1)}</strong>
          </div>
          <div className="inputs">
            <label>
              Entry $
              <input type="number" min={1} value={entry} onChange={(e) => setEntry(Number(e.target.value))} />
            </label>
            <label>
              Payout ×
              <input
                type="number"
                min={1}
                step={0.5}
                value={mult}
                onChange={(e) => setMultiplier(Number(e.target.value))}
              />
            </label>
          </div>
          {legs.length >= 2 && (
            <div className="stat">
              <span>Expected value</span>
              <strong className={ev >= 0 ? "pos" : "neg"}>
                {ev >= 0 ? "+" : "−"}${Math.abs(ev).toFixed(2)}
              </strong>
            </div>
          )}
          <p className="fine">
            Assumes picks are independent. Picks from the same game often move together. Check the payout in the
            DraftKings app.
          </p>
          <div className="actions">
            <button onClick={save} disabled={legs.length < 2 || saved}>
              {saved ? "Saved to tracker" : "Save to tracker"}
            </button>
            <button className="ghost" onClick={onClear}>
              Clear
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

function AddLine({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState({
    sport: "NBA" as Sport,
    player: "",
    team: "",
    opponent: "",
    stat: "PTS" as StatKey,
    line: "",
  });
  const stats = (Object.keys(STATS) as StatKey[]).filter((k) => STATS[k].sport === form.sport);
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "sport") next.stat = (Object.keys(STATS) as StatKey[]).find((s) => STATS[s].sport === v)!;
      return next;
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const line = Number(form.line);
    if (!form.player || !Number.isFinite(line)) return;
    const prop: Prop = {
      id: propId(form.player, form.stat),
      sport: form.sport,
      player: form.player.trim(),
      team: form.team.trim().toUpperCase(),
      opponent: form.opponent.trim().toUpperCase(),
      stat: form.stat,
      line,
    };
    saveCustomProps([prop, ...loadCustomProps().filter((p) => p.id !== prop.id)]);
    setForm((f) => ({ ...f, player: "", line: "" }));
    onAdded();
  };

  return (
    <form className="addline" onSubmit={submit}>
      <select value={form.sport} onChange={(e) => set("sport", e.target.value)}>
        <option>NBA</option>
        <option>NFL</option>
      </select>
      <input placeholder="Player name" value={form.player} onChange={(e) => set("player", e.target.value)} />
      <input placeholder="Team" value={form.team} onChange={(e) => set("team", e.target.value)} size={4} />
      <input placeholder="Opp" value={form.opponent} onChange={(e) => set("opponent", e.target.value)} size={4} />
      <select value={form.stat} onChange={(e) => set("stat", e.target.value)}>
        {stats.map((s) => (
          <option key={s} value={s}>
            {STATS[s].label}
          </option>
        ))}
      </select>
      <input placeholder="Line" inputMode="decimal" value={form.line} onChange={(e) => set("line", e.target.value)} size={5} />
      <button type="submit">Add</button>
    </form>
  );
}

const PASTE_EXAMPLE = `Nikola Jokic DEN vs GS Points 27.5
Shai Gilgeous-Alexander Pts + Reb + Ast 41.5
Josh Allen Pass Yds 245.5`;

function PasteLines({ onAdded }: { onAdded: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/lines", { method: "POST", body: JSON.stringify({ text }) });
      const body = (await res.json()) as { props: Prop[]; skipped: string[]; unresolved: string[] };
      const ids = new Set(body.props.map((p) => p.id));
      saveCustomProps([...body.props, ...loadCustomProps().filter((p) => !ids.has(p.id))]);
      const problems = [
        body.unresolved.length ? `Couldn't find: ${body.unresolved.join(", ")}.` : "",
        body.skipped.length ? `Couldn't read: ${body.skipped.slice(0, 3).join("; ")}${body.skipped.length > 3 ? "…" : ""}.` : "",
      ].filter(Boolean);
      setNote(`Added ${body.props.length} line${body.props.length === 1 ? "" : "s"}. ${problems.join(" ")}`);
      if (body.props.length) {
        setText("");
        onAdded();
      }
    } catch {
      setNote("Something went wrong reading those lines. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="paste" onSubmit={submit}>
      <label htmlFor="paste-lines">
        Paste lines from Pick 6, one per line or as copied from the app: player, stat, and the number. Teams are
        optional.
      </label>
      <textarea
        id="paste-lines"
        rows={6}
        placeholder={PASTE_EXAMPLE}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="pasteactions">
        <button type="submit" disabled={busy || !text.trim()}>
          {busy ? "Looking up players…" : "Score these lines"}
        </button>
        {note && <span className="muted">{note}</span>}
      </div>
    </form>
  );
}
