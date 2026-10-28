"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SignInPrompt, useAccount } from "@/components/Account";
import { UsernameForm } from "@/components/Leaderboard";

interface CrewRow {
  id: string;
  name: string;
  members: number;
  owner: boolean;
}

async function post(body: unknown): Promise<{ crew?: { id: string }; error?: string }> {
  const res = await fetch("/api/crews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ error: "Try again." }));
}

export default function Crews() {
  const account = useAccount();
  const router = useRouter();
  const [crews, setCrews] = useState<CrewRow[] | null>(null);
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!account.signedIn) return;
    fetch("/api/crews", { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { crews: CrewRow[] }) => setCrews(b.crews))
      .catch(() => setCrews([]));
  }, [account.signedIn]);

  const go = async (action: "create" | "join") => {
    setBusy(action);
    setNote("");
    const r = await post(action === "create" ? { action, name } : { action, invite });
    setBusy("");
    if (r.crew) router.push(`/crews/${r.crew.id}`);
    else setNote(r.error ?? "Try again.");
  };

  return (
    <div className="crews">
      <div className="hero">
        <div>
          <h1>Crews</h1>
          <p className="muted">Private groups for you and your friends. See each other's picks, tail a slip in one tap, and settle who's best.</p>
        </div>
      </div>

      {!account.enabled && <p className="banner">Crews need accounts, which aren't set up on this site yet.</p>}
      {account.enabled && account.loaded && !account.signedIn && (
        <div className="signinprompt">
          <small>Sign in to start a crew or join one.</small>
          <SignInPrompt>Sign in</SignInPrompt>
        </div>
      )}

      {account.signedIn && !account.username && (
        <div className="crewstep">
          <strong>First, pick a username</strong>
          <small>It's how your crew sees you.</small>
          <UsernameForm />
        </div>
      )}

      {account.signedIn && (
        <>
          {crews === null && <div className="crewlist"><div className="crewcard skeletoncard" aria-hidden /></div>}
          {crews && crews.length > 0 && (
            <div className="crewlist">
              {crews.map((c) => (
                <Link key={c.id} href={`/crews/${c.id}`} className="crewcard">
                  <span className="crewavatar" aria-hidden>
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {c.members} member{c.members === 1 ? "" : "s"}
                      {c.owner ? " · you run it" : ""}
                    </small>
                  </span>
                  <span aria-hidden>›</span>
                </Link>
              ))}
            </div>
          )}

          <div className="crewforms">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                go("create");
              }}
            >
              <label htmlFor="crewname">Start a crew</label>
              <div>
                <input id="crewname" placeholder="Crew name" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
                <button type="submit" disabled={!!busy || !account.username || name.trim().length < 2}>
                  {busy === "create" ? "Starting…" : "Start"}
                </button>
              </div>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                go("join");
              }}
            >
              <label htmlFor="crewinvite">Got an invite?</label>
              <div>
                <input id="crewinvite" placeholder="Paste the invite link" value={invite} onChange={(e) => setInvite(e.target.value)} />
                <button type="submit" className="ghost" disabled={!!busy || !account.username || !invite.trim()}>
                  {busy === "join" ? "Joining…" : "Join"}
                </button>
              </div>
            </form>
          </div>
          {note && <p className="note">{note}</p>}
        </>
      )}
    </div>
  );
}
