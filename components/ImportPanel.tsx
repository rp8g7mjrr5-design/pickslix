"use client";

import { useState } from "react";
import { loadCustomProps, saveCustomProps } from "@/lib/storage.ts";
import { SPORTS, STATS, statSport, type Prop, type Sport, type StatKey } from "@/lib/types.ts";

export interface ImportResult {
  props: Prop[];
  sides: Record<string, "OVER" | "UNDER">;
  skipped: string[];
  unresolved: string[];
}

type Tab = "paste" | "type";

const propId = (player: string, stat: string) => `custom-${player}-${stat}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const PASTE_EXAMPLE = `Nikola Jokic DEN vs GS Points 27.5
Shai Gilgeous-Alexander Pts + Reb + Ast 41.5
Josh Allen Pass Yds 245.5`;

/** Save imported props and describe what happened. */
function commit(body: ImportResult): string {
  const ids = new Set(body.props.map((p) => p.id));
  saveCustomProps([...body.props, ...loadCustomProps().filter((p) => !ids.has(p.id))]);
  const n = body.props.length;
  const parts = [n ? `Added ${n} line${n === 1 ? "" : "s"}.` : "No lines found."];
  if (body.unresolved.length) parts.push(`No stats found for ${body.unresolved.join(", ")} yet, so ${body.unresolved.length === 1 ? "it shows" : "they show"} without a projection.`);
  if (body.skipped.length) parts.push(`Couldn't read ${body.skipped.length} entr${body.skipped.length === 1 ? "y" : "ies"}.`);
  return parts.join(" ");
}

export default function ImportPanel({
  initialTab = "paste",
  onImported,
  onClose,
}: {
  initialTab?: Tab;
  onImported: (r: ImportResult) => void;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <section className="import" aria-label="Add lines">
      <div className="importhead">
        <div className="seg" role="tablist">
          {(
            [
              ["paste", "Paste text"],
              ["type", "Type one"],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </div>
        {onClose && (
          <button className="x" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>
      {tab === "paste" && <PasteImport onImported={onImported} />}
      {tab === "type" && <TypeOne onImported={onImported} />}
    </section>
  );
}

function PasteImport({ onImported }: { onImported: (r: ImportResult) => void }) {
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
      const body = (await res.json()) as ImportResult;
      setNote(commit(body));
      if (body.props.length) setText("");
      onImported(body);
    } catch {
      setNote("Something went wrong reading those lines. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="paste" onSubmit={submit}>
      <label htmlFor="paste-lines">
        One prop per line, or the text as copied from the app: player, stat and number. Teams are optional. Add
        "More" or "Less" to load it into your slip.
      </label>
      <textarea id="paste-lines" rows={5} placeholder={PASTE_EXAMPLE} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="pasteactions">
        <button type="submit" disabled={busy || !text.trim()}>
          {busy ? "Looking up players…" : "Score these lines"}
        </button>
        {note && <span className="note">{note}</span>}
      </div>
    </form>
  );
}

function TypeOne({ onImported }: { onImported: (r: ImportResult) => void }) {
  const [form, setForm] = useState({ sport: "NBA" as Sport, player: "", stat: "PTS" as StatKey, line: "" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const stats = (Object.keys(STATS) as StatKey[]).filter((k) => STATS[k].sport === statSport(form.sport));
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "sport") next.stat = (Object.keys(STATS) as StatKey[]).find((s) => STATS[s].sport === statSport(v as Sport))!;
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const line = Number(form.line);
    if (!form.player.trim() || !Number.isFinite(line) || !form.line) return;
    setBusy(true);
    try {
      // Same lookup as pasting, so team and opponent fill in on their own.
      const text = `${form.player.trim()} ${STATS[form.stat].label} ${line}`;
      const res = await fetch("/api/lines", { method: "POST", body: JSON.stringify({ text }) });
      const body = (await res.json()) as ImportResult;
      if (!body.props.length) {
        // Couldn't look the player up: keep the line anyway so it still shows.
        body.props.push({ id: propId(form.player, form.stat), sport: form.sport, player: form.player.trim(), team: "", opponent: "", stat: form.stat, line });
        body.unresolved = [];
      }
      setNote(commit(body));
      setForm((f) => ({ ...f, player: "", line: "" }));
      onImported(body);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="addline" onSubmit={submit}>
      <select value={form.sport} onChange={(e) => set("sport", e.target.value)} aria-label="Sport">
        {SPORTS.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <input placeholder="Player name" value={form.player} onChange={(e) => set("player", e.target.value)} aria-label="Player" />
      <select value={form.stat} onChange={(e) => set("stat", e.target.value)} aria-label="Stat">
        {stats.map((s) => (
          <option key={s} value={s}>
            {STATS[s].label}
          </option>
        ))}
      </select>
      <input placeholder="Line" inputMode="decimal" value={form.line} onChange={(e) => set("line", e.target.value)} size={6} aria-label="Line" />
      <button type="submit" disabled={busy}>
        {busy ? "Adding…" : "Add"}
      </button>
      {note && <span className="note">{note}</span>}
    </form>
  );
}
