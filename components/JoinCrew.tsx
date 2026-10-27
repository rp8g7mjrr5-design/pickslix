"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SignInPrompt, useAccount } from "@/components/Account";
import { UsernameForm } from "@/components/Leaderboard";

/** Landing page for an invite link: sign in, pick a username if needed, then join. */
export default function JoinCrew({ code }: { code: string }) {
  const account = useAccount();
  const router = useRouter();
  const [error, setError] = useState("");
  const tried = useRef(false);

  useEffect(() => {
    if (!account.signedIn || !account.username || tried.current) return;
    tried.current = true;
    fetch("/api/crews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", invite: code }) })
      .then((r) => r.json() as Promise<{ crew?: { id: string }; error?: string }>)
      .then((r) => (r.crew ? router.replace(`/crews/${r.crew.id}`) : setError(r.error ?? "Couldn't join.")))
      .catch(() => setError("Couldn't join. Try again."));
  }, [account.signedIn, account.username, code, router]);

  return (
    <div className="crews joincrew">
      <h1>You're invited to a crew</h1>
      <p className="muted">See each other's picks, tail slips in one tap, and find out who's really the sharpest.</p>
      {!account.enabled && <p className="banner">Crews need accounts, which aren't set up on this site yet.</p>}
      {account.enabled && account.loaded && !account.signedIn && <SignInPrompt>Sign in to join</SignInPrompt>}
      {account.signedIn && !account.username && (
        <div className="crewstep">
          <strong>Pick a username</strong>
          <small>It's how your crew sees you. You'll join right after.</small>
          <UsernameForm />
        </div>
      )}
      {account.signedIn && account.username && !error && <p className="muted">Joining…</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
