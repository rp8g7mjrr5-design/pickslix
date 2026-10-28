"use client";
// Picking a username: required right after signing up (it's your name on the leaderboard, in crews and on
// shared slips), and changeable from the profile.
import { useClerk, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useAccount } from "@/components/Account";
import { suggestUsername } from "@/lib/profile.ts";

const SHAPE = /^[A-Za-z0-9_]{3,20}$/;

type Check = { state: "idle" | "checking" | "ok" } | { state: "bad"; error: string };

/** Live "is this name free?" while typing, debounced. */
function useUsernameCheck(value: string, current: string | null): Check {
  const [check, setCheck] = useState<Check>({ state: "idle" });
  useEffect(() => {
    const name = value.trim();
    if (!name || name.toLowerCase() === current?.toLowerCase()) return setCheck({ state: "idle" });
    if (!SHAPE.test(name)) return setCheck({ state: "bad", error: "Use 3 to 20 letters, numbers or underscores." });
    setCheck({ state: "checking" });
    const t = setTimeout(() => {
      fetch(`/api/account/username?name=${encodeURIComponent(name)}`, { cache: "no-store" })
        .then((r) => r.json() as Promise<{ ok: boolean; error?: string }>)
        .then((r) => setCheck(r.ok ? { state: "ok" } : { state: "bad", error: r.error ?? "Try another name." }))
        .catch(() => setCheck({ state: "idle" }));
    }, 350);
    return () => clearTimeout(t);
  }, [value, current]);
  return check;
}

async function saveUsername(name: string): Promise<{ username?: string | null; error?: string }> {
  return fetch("/api/account/username", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: name }),
  })
    .then((x) => x.json())
    .catch(() => ({ error: "Couldn't save. Try again." }));
}

/** A username input with the live check, a save button, and what went wrong. */
export function UsernameField({ initial = "", submitLabel, onSaved, onCancel }: {
  initial?: string;
  submitLabel: string;
  onSaved?: (name: string) => void;
  onCancel?: () => void;
}) {
  const account = useAccount();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const check = useUsernameCheck(value, account.username);
  useEffect(() => setValue((v) => v || initial), [initial]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await saveUsername(value.trim());
    setBusy(false);
    if (r.error || !r.username) return setError(r.error ?? "Couldn't save. Try again.");
    account.setUsername(r.username);
    onSaved?.(r.username);
  };

  const unchanged = value.trim().toLowerCase() === (account.username ?? "").toLowerCase();
  return (
    <form className="namefield" onSubmit={submit}>
      <div className="nameinput">
        <span aria-hidden>@</span>
        <input
          value={value}
          onChange={(e) => (setValue(e.target.value.replace(/\s/g, "_")), setError(""))}
          maxLength={20}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          spellCheck={false}
          placeholder="username"
          aria-label="Username"
          aria-invalid={check.state === "bad"}
        />
        {check.state === "ok" && <b className="pos" aria-label="Available">✓</b>}
      </div>
      <button type="submit" disabled={busy || unchanged || check.state === "bad" || check.state === "checking" || !value.trim()}>
        {busy ? "Saving…" : submitLabel}
      </button>
      {onCancel && (
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
      <small className={check.state === "bad" || error ? "neg" : "muted"}>
        {error || (check.state === "bad" ? check.error : check.state === "ok" ? "That one's free." : "3 to 20 letters, numbers or underscores.")}
      </small>
    </form>
  );
}

/** Asks a newly signed-up account for a username before anything else. Nothing once they have one. */
export function UsernameGate() {
  const account = useAccount();
  if (!account.enabled || !account.signedIn || !account.synced || account.username) return null;
  return <GateCard />;
}

function GateCard() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const suggestion = suggestUsername(user?.firstName, user?.lastName, user?.primaryEmailAddress?.emailAddress);
  useEffect(() => {
    // Keep the page behind from scrolling while the card is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="gatewrap" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate">
        {user?.imageUrl && <img className="gateavatar" src={user.imageUrl} alt="" width={56} height={56} />}
        <h2 id="gate-title">Pick your username</h2>
        <p className="muted">It's how you show up on the leaderboard, in crews and on slips you share. You can change it later.</p>
        <UsernameField initial={suggestion} submitLabel="Let's go" />
        <button className="linkish" onClick={() => signOut()}>
          Not you? Sign out
        </button>
      </div>
    </div>
  );
}
