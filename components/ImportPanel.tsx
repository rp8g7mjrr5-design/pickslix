"use client";

import { useEffect, useRef, useState } from "react";
import { readTextOnDevice, toDataUrl } from "@/lib/ocr.ts";
import { loadCustomProps, saveCustomProps } from "@/lib/storage.ts";
import { STATS, type Prop, type Sport, type StatKey } from "@/lib/types.ts";

export interface ImportResult {
  props: Prop[];
  sides: Record<string, "OVER" | "UNDER">;
  skipped: string[];
  unresolved: string[];
}

type Tab = "photo" | "paste" | "type";

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
  initialTab = "photo",
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
              ["photo", "Screenshot"],
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
      {tab === "photo" && <PhotoImport onImported={onImported} />}
      {tab === "paste" && <PasteImport onImported={onImported} />}
      {tab === "type" && <TypeOne onImported={onImported} />}
    </section>
  );
}

function PhotoImport({ onImported }: { onImported: (r: ImportResult) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"server" | "device" | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<string>("");
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    fetch("/api/screenshot")
      .then((r) => r.json())
      .then((b) => setMode(b.mode))
      .catch(() => setMode("device"));
  }, []);

  // Paste an image straight from the clipboard (Ctrl/Cmd+V) while this tab is open.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        handle(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const handle = async (file: File) => {
    if (busy) return;
    if (!file.type.startsWith("image/")) return setNote("That isn't an image.");
    setNote("");
    setPreview(URL.createObjectURL(file));
    try {
      let body: ImportResult;
      if (mode === "server") {
        setBusy("Reading your picks…");
        const res = await fetch("/api/screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: await toDataUrl(file) }),
        });
        body = await res.json();
        if (!res.ok) throw new Error((body as unknown as { error?: string }).error ?? "Upload failed");
      } else {
        setBusy("Loading text reader…");
        const text = await readTextOnDevice(file, (p) => setBusy(`Reading screenshot… ${Math.round(p * 100)}%`));
        setBusy("Looking up players…");
        const res = await fetch("/api/lines", { method: "POST", body: JSON.stringify({ text }) });
        body = await res.json();
      }
      setNote(commit(body));
      onImported(body);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't read that screenshot. Try again or paste the lines.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="photo">
      <button
        type="button"
        className={`drop ${drag ? "drag" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) handle(f);
        }}
        disabled={!!busy}
      >
        {preview ? <img src={preview} alt="Your screenshot" /> : <span className="dropicon" aria-hidden>📸</span>}
        <span>
          <strong>{busy || "Upload a Pick 6 screenshot"}</strong>
          <small>
            {busy
              ? "This takes a few seconds."
              : "The board or your saved entry. Tap to choose, drop it here, or paste it. Picks you made load straight into your slip."}
          </small>
        </span>
      </button>
      {busy && <div className="bar" aria-hidden><i /></div>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) handle(f);
        }}
      />
      {note && <p className="note">{note}</p>}
      {mode === "device" && !note && (
        <p className="fine">Read on your device. Crop to the picks for best results, and check the numbers after.</p>
      )}
    </div>
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
  const stats = (Object.keys(STATS) as StatKey[]).filter((k) => STATS[k].sport === form.sport);
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "sport") next.stat = (Object.keys(STATS) as StatKey[]).find((s) => STATS[s].sport === v)!;
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
        <option>NBA</option>
        <option>NFL</option>
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
