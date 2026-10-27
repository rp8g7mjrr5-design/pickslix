"use client";

import { useEffect, useRef, useState } from "react";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  imageUrl: string;
  createdAt: number;
  lastActiveAt: number | null;
  banned: boolean;
  admin: boolean;
  username: string | null;
  plan: "monthly" | "yearly" | "lifetime" | null;
  granted: boolean;
  picks: number;
  hitRate: number;
}
type Action = "ban" | "unban" | "grant" | "revoke";
type Filter = "all" | "pro" | "free" | "banned";

const ago = (ms: number | null) => {
  if (!ms) return "never";
  const d = Math.floor((Date.now() - ms) / 86400_000);
  if (d < 1) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
const planLabel = (u: User) => (u.plan === "lifetime" ? (u.granted ? "Gifted" : "Lifetime") : u.plan === "yearly" ? "Yearly" : u.plan === "monthly" ? "Monthly" : null);

const ASK: Record<Action, (who: string) => string> = {
  ban: (who) => `Ban ${who}? They're signed out everywhere, can't sign back in, and disappear from the leaderboard and crews.`,
  unban: (who) => `Unban ${who}? They can sign in again.`,
  grant: (who) => `Give ${who} free lifetime Pro?`,
  revoke: (who) => `Take away ${who}'s Pro?`,
};

/** Every account on the site: search, filter, ban and hand out Pro. */
export default function AdminAccounts() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const seq = useRef(0);

  const load = async (query: string, p: number) => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}&page=${p}`, { cache: "no-store" });
      const body = await r.json();
      if (n !== seq.current) return;
      if (!r.ok) throw new Error(body.error);
      setUsers((prev) => (p === 0 ? body.users : [...prev, ...body.users]));
      setTotal(body.total);
      setPage(p);
      setMore((p + 1) * body.pageSize < body.total);
      setMsg("");
    } catch (e) {
      if (n === seq.current) setMsg((e as Error).message || "Couldn't load accounts.");
    } finally {
      if (n === seq.current) setLoading(false);
    }
  };

  // Search as you type, a beat after the last key.
  useEffect(() => {
    const t = setTimeout(() => load(q, 0), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const act = async (u: User, action: Action) => {
    const who = u.username ? `@${u.username}` : u.email ?? "this account";
    if (!confirm(ASK[action](who))) return;
    setBusy(u.id + action);
    const r = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: u.id, action }) })
      .then((res) => res.json())
      .catch(() => ({ error: "Try again." }));
    setBusy("");
    if (r.error) return setMsg(r.error);
    setUsers((list) => list.map((x) => (x.id === u.id ? r.user : x)));
    setMsg({ ban: `Banned ${who}.`, unban: `Unbanned ${who}.`, grant: `${who} has Pro now.`, revoke: `Took Pro away from ${who}.` }[action]);
  };

  const shown = users.filter((u) => filter === "all" || (filter === "pro" ? u.plan : filter === "banned" ? u.banned : !u.plan && !u.banned));
  const counts = { pro: users.filter((u) => u.plan).length, banned: users.filter((u) => u.banned).length };

  return (
    <section className="accounts">
      <div className="accountsbar">
        <input type="search" placeholder="Search name, email or @username" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search accounts" />
        <div className="seg" role="tablist" aria-label="Filter accounts">
          {(["all", "pro", "free", "banned"] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
              {f === "pro" && counts.pro ? ` ${counts.pro}` : f === "banned" && counts.banned ? ` ${counts.banned}` : ""}
            </button>
          ))}
        </div>
      </div>
      <small className="muted">
        {loading && !users.length ? "Loading accounts…" : `${total} account${total === 1 ? "" : "s"}${q ? ` matching “${q}”` : ""}`}
        {filter !== "all" && users.length < total ? " · filter covers the ones loaded below" : ""}
      </small>
      {msg && <p className="note">{msg}</p>}

      <div className="accountlist">
        {!loading && !shown.length && <p className="muted empty">No accounts here.</p>}
        {shown.map((u) => {
          const plan = planLabel(u);
          return (
            <div key={u.id} className={`accountrow ${u.banned ? "banned" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.imageUrl} alt="" width={36} height={36} className="accountavatar" />
              <div className="accountwho">
                <strong>
                  {u.username ? `@${u.username}` : u.name ?? "No username"}
                  {u.admin && <span className="tag">Admin</span>}
                  {u.banned && <span className="tag bad">Banned</span>}
                  {plan && <span className={`probadge ${u.plan !== "monthly" ? "gold" : ""}`}>{plan.toUpperCase()}</span>}
                </strong>
                <small>
                  {u.email ?? "no email"}
                  {u.username && u.name ? ` · ${u.name}` : ""}
                </small>
              </div>
              <div className="accountstats">
                <span>
                  <b>{u.picks}</b> picks
                </span>
                <span>
                  <b>{u.picks ? `${Math.round(u.hitRate * 100)}%` : "–"}</b> hit
                </span>
                <span title={new Date(u.createdAt).toLocaleString()}>Joined {ago(u.createdAt)}</span>
                <span>Seen {ago(u.lastActiveAt)}</span>
              </div>
              <div className="accountactions">
                {!u.plan && !u.banned && (
                  <button className="small" disabled={!!busy} onClick={() => act(u, "grant")}>
                    {busy === u.id + "grant" ? "…" : "Give Pro"}
                  </button>
                )}
                {u.plan && u.plan === "lifetime" && (
                  <button className="ghost small" disabled={!!busy} onClick={() => act(u, "revoke")}>
                    {busy === u.id + "revoke" ? "…" : "Remove Pro"}
                  </button>
                )}
                {!u.admin &&
                  (u.banned ? (
                    <button className="ghost small" disabled={!!busy} onClick={() => act(u, "unban")}>
                      {busy === u.id + "unban" ? "…" : "Unban"}
                    </button>
                  ) : (
                    <button className="ghost small danger" disabled={!!busy} onClick={() => act(u, "ban")}>
                      {busy === u.id + "ban" ? "…" : "Ban"}
                    </button>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
      {more && (
        <button className="ghost loadmore" disabled={loading} onClick={() => load(q, page + 1)}>
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
      <p className="fine">Paid subscriptions are managed in Stripe. Gifted Pro is lifetime and can be taken back here.</p>
    </section>
  );
}
