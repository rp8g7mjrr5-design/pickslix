"use client";
// Invite a friend: the banner a friend sees when they arrive from an invite or a shared slip, the claim once
// they've signed up, and the invite link on the profile.
import { useEffect, useRef, useState } from "react";
import { setProKey, usePro } from "@/lib/proClient.ts";
import { SignInPrompt, useAccount } from "@/components/Account";

const REF = "pickslix.ref";

function readRef(): string {
  try {
    return localStorage.getItem(REF) ?? "";
  } catch {
    return "";
  }
}

/** Remember who invited this browser, unless someone already did. */
export function rememberRef(name: string | undefined) {
  if (!name || !/^@?[A-Za-z0-9_]{3,20}$/.test(name)) return;
  try {
    if (!localStorage.getItem(REF)) localStorage.setItem(REF, name.replace(/^@/, ""));
  } catch {}
}

function clearRef() {
  try {
    localStorage.removeItem(REF);
  } catch {}
}

/** Shown on every page: the invite banner before sign-up, the reward after. */
export function InviteBanner() {
  const account = useAccount();
  const pro = usePro();
  const [ref, setRef] = useState("");
  const [done, setDone] = useState("");
  const tried = useRef(false);

  useEffect(() => {
    rememberRef(new URLSearchParams(window.location.search).get("ref") ?? undefined);
    setRef(readRef());
  }, []);

  // Once a new account has its username, apply the invite.
  useEffect(() => {
    if (!ref || tried.current || !account.signedIn || !account.synced || !account.username) return;
    tried.current = true;
    fetch("/api/referral", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref }) })
      .then((r) => r.json() as Promise<{ ok?: boolean; by?: string; proKey?: string | null; error?: string }>)
      .then((r) => {
        if (r.ok) {
          if (r.proKey) setProKey(r.proKey);
          setDone(`You and @${r.by} each got a free week of Pro.`);
        }
      })
      .catch(() => {})
      .finally(() => {
        clearRef();
        setRef("");
      });
  }, [ref, account.signedIn, account.synced, account.username]);

  if (done)
    return (
      <div className="invitebanner good" role="status">
        <span>🎉 {done} Everything is unlocked.</span>
        <button className="x" onClick={() => setDone("")} aria-label="Close">
          ×
        </button>
      </div>
    );
  if (!ref || !account.enabled || !account.loaded || account.signedIn || !pro?.required) return null;
  return (
    <div className="invitebanner">
      <span>
        <strong>@{ref} invited you.</strong> Sign up free and you both get a week of LayLock Pro.
      </span>
      <SignInPrompt>Sign up</SignInPrompt>
    </div>
  );
}

interface Stats {
  enabled: boolean;
  signedIn?: boolean;
  days?: number;
  joined?: number;
  daysEarned?: number;
  left?: number;
}

/** The profile's invite card: your link, a share button and who has joined. */
export function InviteCard() {
  const account = useAccount();
  const [stats, setStats] = useState<Stats | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    fetch("/api/referral", { cache: "no-store" })
      .then((r) => r.json() as Promise<Stats>)
      .then(setStats)
      .catch(() => {});
  }, []);
  if (!stats?.enabled || !stats.signedIn || !account.username) return null;
  const link = `${window.location.origin}/?ref=${account.username}`;
  const share = async () => {
    const text = `I use LayLock to check my Pick 6 picks. Sign up with my link and we both get a week of Pro free.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "LayLock", text, url: link });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    await navigator.clipboard?.writeText(link).catch(() => {});
    setNote("Link copied");
    setTimeout(() => setNote(""), 2000);
  };
  return (
    <section className="report invitecard">
      <div className="reporthead">
        <h2>Invite friends, get Pro free</h2>
        <small>
          Each friend who signs up with your link gets a week of Pro, and so do you
          {stats.left !== undefined && stats.left < 12 ? ` (${stats.left} invites left)` : ""}.
        </small>
      </div>
      <div className="invitelink">
        <code>{link.replace(/^https?:\/\//, "")}</code>
        <button onClick={share}>{note || "Share link"}</button>
      </div>
      <small className="muted">
        {stats.joined
          ? `${stats.joined} friend${stats.joined === 1 ? "" : "s"} joined · ${stats.daysEarned} days of Pro earned`
          : "Your shared slips count too: anyone who signs up from one is your invite."}
      </small>
    </section>
  );
}
