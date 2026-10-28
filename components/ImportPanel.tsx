"use client";

import { useState } from "react";
import { loadCustomProps, saveCustomProps } from "@/lib/storage.ts";
import type { Prop } from "@/lib/types.ts";

export interface ImportResult {
  props: Prop[];
  sides: Record<string, "OVER" | "UNDER">;
  skipped: string[];
  unresolved: string[];
}

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

/** Paste lines copied from Pick 6 (or typed, one per line); each player is looked up and the line scored. */
export default function ImportPanel({ onImported, onClose }: { onImported: (r: ImportResult) => void; onClose?: () => void }) {
  return (
    <section className="import" aria-label="Paste lines">
      <div className="importhead">
        <strong>Paste lines</strong>
        {onClose && (
          <button className="x" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>
      <PasteImport onImported={onImported} />
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
        Copy picks from the Pick 6 app, or type them one per line: player, stat, number. Add &quot;More&quot; or &quot;Less&quot; and
        they go straight into your slip.
      </label>
      <textarea id="paste-lines" rows={5} placeholder={PASTE_EXAMPLE} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="pasteactions">
        <button type="submit" disabled={busy || !text.trim()}>
          {busy ? "Looking up players…" : "Score them"}
        </button>
        {note && <span className="note">{note}</span>}
      </div>
    </form>
  );
}
