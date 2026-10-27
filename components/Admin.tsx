"use client";

import { useEffect, useState } from "react";
import { SignInPrompt, useAccount } from "@/components/Account";

interface Code {
  code: string;
  source: "vercel" | "admin";
  note?: string;
  createdAt?: string;
  used: boolean;
  usedAt: string | null;
  revoked: boolean;
}
interface Data {
  codes: Code[];
  stats: {
    plans: { monthly: number; yearly: number; lifetime: number };
    accounts: number;
    odds: { remaining: number; at: string } | null;
    oddsPaused: { status: number; at: string } | null;
  };
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

async function post(body: unknown): Promise<{ error?: string; created?: string[] }> {
  const res = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ error: "Try again." }));
}

export default function Admin() {
  const account = useAccount();
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [show, setShow] = useState<"unused" | "used" | "all">("unused");
  const [count, setCount] = useState(5);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [fresh, setFresh] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  const load = () =>
    fetch("/api/admin", { cache: "no-store" }).then(async (r) => {
      if (r.status === 403) return setDenied(true);
      setDenied(false);
      setData(await r.json());
    });
  useEffect(() => {
    if (account.signedIn || !account.enabled) load().catch(() => setMsg("Couldn't load admin data."));
  }, [account.signedIn, account.enabled]);

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(""), 1500);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await post({ action: "create", count, note });
    setBusy(false);
    if (r.error) return setMsg(r.error);
    setFresh(r.created ?? []);
    setNote("");
    setMsg("");
    load();
  };

  const act = async (action: "delete" | "revoke", code: string) => {
    const ask = action === "delete" ? `Delete ${code}? It hasn't been used.` : `Turn off the lifetime Pro that ${code} gave? This can't be undone.`;
    if (!confirm(ask)) return;
    const r = await post({ action, code });
    setMsg(r.error ?? (action === "delete" ? `Deleted ${code}.` : `Revoked ${code}.`));
    load();
  };

  if (account.enabled && account.loaded && !account.signedIn) {
    return (
      <div className="admin">
        <h1>Admin</h1>
        <SignInPrompt>Sign in</SignInPrompt>
      </div>
    );
  }
  if (denied) {
    return (
      <div className="admin">
        <h1>Admin</h1>
        <p className="muted">This account isn't an admin. Add its email to ADMIN_EMAILS in Vercel, then redeploy.</p>
      </div>
    );
  }
  if (!data) return <div className="admin"><h1>Admin</h1><p className="muted">{msg || "Loading…"}</p></div>;

  const { stats } = data;
  const unused = data.codes.filter((c) => !c.used);
  const list = data.codes.filter((c) => show === "all" || (show === "used") === c.used);
  const members = stats.plans.monthly + stats.plans.yearly + stats.plans.lifetime;

  return (
    <div className="admin">
      <div className="hero">
        <div>
          <h1>
            Admin <span className="probadge">OWNER</span>
          </h1>
          <p className="muted">Lifetime codes, Pro members and the odds feed.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <small>Pro members</small>
          <strong>{members}</strong>
          <small className="muted">
            {stats.plans.monthly} monthly · {stats.plans.yearly} yearly · {stats.plans.lifetime} lifetime
          </small>
        </div>
        <div className="card">
          <small>Accounts</small>
          <strong>{stats.accounts}</strong>
          <small className="muted">signed in at least once</small>
        </div>
        <div className="card">
          <small>Odds credits left</small>
          <strong className={stats.odds && stats.odds.remaining < 50 ? "neg" : ""}>{stats.odds ? stats.odds.remaining : "–"}</strong>
          <small className="muted">
            {stats.oddsPaused ? `Paused after a ${stats.oddsPaused.status}` : stats.odds ? `as of ${day(stats.odds.at)}` : "no calls yet"}
          </small>
        </div>
        <div className="card">
          <small>Unused codes</small>
          <strong>{unused.length}</strong>
          <small className="muted">of {data.codes.length}</small>
        </div>
      </div>

      <form className="admincreate" onSubmit={create}>
        <strong>Make lifetime codes</strong>
        <div>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many">
            {[1, 3, 5, 10, 25].map((n) => (
              <option key={n} value={n}>
                {n} code{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>
          <input placeholder="Who it's for (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} />
          <button type="submit" disabled={busy}>
            {busy ? "Making…" : "Make"}
          </button>
        </div>
        {fresh.length > 0 && (
          <div className="freshcodes">
            <code>{fresh.join("\n")}</code>
            <button type="button" className="ghost small" onClick={() => copy(fresh.join("\n"))}>
              {copied === fresh.join("\n") ? "Copied" : "Copy all"}
            </button>
          </div>
        )}
      </form>

      {msg && <p className="note">{msg}</p>}

      <div className="trackbar">
        <div className="seg" role="tablist" aria-label="Show codes">
          {(["unused", "used", "all"] as const).map((f) => (
            <button key={f} role="tab" aria-selected={show === f} className={show === f ? "on" : ""} onClick={() => setShow(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="codelist">
        {!list.length && <p className="muted empty">No {show} codes.</p>}
        {list.map((c) => (
          <div key={c.code} className={`coderow ${c.used ? "used" : ""}`}>
            <code>{c.code}</code>
            <small>
              {c.revoked ? "Revoked" : c.used ? `Used${c.usedAt ? ` ${day(c.usedAt)}` : ""}` : "Unused"}
              {c.note ? ` · ${c.note}` : ""}
              {c.source === "vercel" ? " · from Vercel" : ""}
            </small>
            <div>
              {!c.used && (
                <button className="ghost small" onClick={() => copy(c.code)}>
                  {copied === c.code ? "Copied" : "Copy"}
                </button>
              )}
              {!c.used && c.source === "admin" && (
                <button className="ghost small" onClick={() => act("delete", c.code)}>
                  Delete
                </button>
              )}
              {c.used && !c.revoked && (
                <button className="ghost small" onClick={() => act("revoke", c.code)}>
                  Revoke
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="fine">Codes from Vercel come from LIFETIME_CODES and can only be removed there. Codes made here work right away.</p>
    </div>
  );
}
