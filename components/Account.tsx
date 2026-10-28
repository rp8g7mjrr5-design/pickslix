"use client";
// Accounts (Clerk) on the browser side. Everything here is a no-op when the site has no Clerk keys, so
// components can use useAccount() without checking.
import { SignInButton, UserButton, useAuth, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { getProKey, setProKey } from "@/lib/proClient.ts";
import { forgetAccountSlips } from "@/lib/storage.ts";

export const accountsEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

interface AccountState {
  enabled: boolean;
  /** Clerk has finished loading (always true when accounts are off). */
  loaded: boolean;
  /** Clerk errored or still hasn't loaded after a while: usually an ad blocker, or the site opened on a domain its keys don't cover. */
  failed: boolean;
  signedIn: boolean;
  /** Listed in ADMIN_EMAILS. */
  admin: boolean;
  /** The account's details have come back from the server (so a missing username really is missing). */
  synced: boolean;
  /** Public name on the leaderboard and in crews; picked right after signing up. */
  username: string | null;
  /** Off the public leaderboard by choice. */
  hidden: boolean;
  setUsername: (name: string | null) => void;
  setHidden: (hidden: boolean) => void;
}

const Ctx = createContext<AccountState>({
  enabled: false, loaded: true, failed: false, signedIn: false, admin: false, synced: false, username: null, hidden: false,
  setUsername: () => {}, setHidden: () => {},
});
export const useAccount = () => useContext(Ctx);

/** How long to wait for Clerk before telling people sign-in isn't loading. */
const LOAD_TIMEOUT_MS = 8000;

/** Set when this device's Pro key came from the account, so signing out takes it away again. */
const FROM_ACCOUNT = "pickslix.proFromAccount";

/** Keep the device in step with the account: pick up its Pro key on sign-in, link a device key it lacks. */
interface Profile {
  admin: boolean;
  synced: boolean;
  username: string | null;
  hidden: boolean;
}
const NO_PROFILE: Profile = { admin: false, synced: false, username: null, hidden: false };

async function syncAccount(): Promise<Profile> {
  const res = await fetch("/api/account", { cache: "no-store" });
  const a = (await res.json()) as { signedIn?: boolean; proKey?: string | null; pro?: boolean; admin?: boolean; username?: string | null; hidden?: boolean };
  const profile = { admin: Boolean(a.admin), synced: true, username: a.username ?? null, hidden: Boolean(a.hidden) };
  if (!a.signedIn) return profile;
  const local = getProKey();
  if (a.pro && a.proKey) {
    if (a.proKey !== local) setProKey(a.proKey);
  } else if (local) {
    // Pro bought on this device before signing in: attach it to the account.
    const r = await fetch("/api/account/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: local }),
    }).then((x) => x.json() as Promise<{ proKey?: string }>);
    if (r.proKey && r.proKey !== local) setProKey(r.proKey);
  }
  try {
    localStorage.setItem(FROM_ACCOUNT, "1");
  } catch {}
  return profile;
}

function ClerkBridge({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { status } = useClerk();
  const signedIn = Boolean(isSignedIn);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (isLoaded) return setSlow(false);
    const t = setTimeout(() => setSlow(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [isLoaded]);
  const prev = useRef<boolean | null>(null);
  const [profile, setProfile] = useState<Profile>(NO_PROFILE);
  useEffect(() => {
    if (!isLoaded) return;
    const was = prev.current;
    prev.current = signedIn;
    if (signedIn) syncAccount().then(setProfile).catch(() => {});
    else setProfile(NO_PROFILE);
    if (!signedIn && was) {
      // Signed out: what came from the account leaves with it.
      try {
        if (localStorage.getItem(FROM_ACCOUNT)) {
          localStorage.removeItem(FROM_ACCOUNT);
          setProKey("");
        }
      } catch {}
      forgetAccountSlips();
    }
    if (was !== null && was !== signedIn) window.dispatchEvent(new Event("pickslix:account"));
  }, [isLoaded, signedIn]);
  const value = {
    enabled: true,
    loaded: isLoaded,
    failed: !isLoaded && (status === "error" || slow),
    signedIn,
    ...profile,
    setUsername: (username: string | null) => setProfile((p) => ({ ...p, username })),
    setHidden: (hidden: boolean) => setProfile((p) => ({ ...p, hidden })),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  return accountsEnabled ? <ClerkBridge>{children}</ClerkBridge> : <>{children}</>;
}

/**
 * Sign-in button or the account menu, for the top bar. Nothing when accounts are off. Until Clerk has loaded
 * (or when it can't), the button links to /sign-in, which says what's wrong instead of showing nothing.
 */
export function AccountButton() {
  const { enabled, loaded, signedIn } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!enabled || !mounted) return null;
  if (signedIn)
    return (
      <UserButton appearance={{ elements: { avatarBox: { width: 32, height: 32 } } }}>
        <UserButton.MenuItems>
          <UserButton.Link label="My profile" labelIcon={<PersonIcon />} href="/profile" />
          <UserButton.Action label="manageAccount" />
        </UserButton.MenuItems>
        <UserButton.UserProfileLink label="LayLock profile" labelIcon={<PersonIcon />} url="/profile" />
      </UserButton>
    );
  if (!loaded)
    return (
      <Link href="/sign-in" className="button signin">
        Sign in
      </Link>
    );
  return (
    <SignInButton mode="modal">
      <button className="signin">Sign in</button>
    </SignInButton>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}

/** A sign-in prompt for places that need an account. `next` is where to land after signing in. */
export function SignInPrompt({ children, next }: { children: React.ReactNode; next?: string }) {
  const { loaded } = useAccount();
  if (!loaded)
    return (
      <Link href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="button">
        {children}
      </Link>
    );
  return (
    <SignInButton mode="modal" forceRedirectUrl={next}>
      <button>{children}</button>
    </SignInButton>
  );
}

/** The domain a Clerk publishable key serves, e.g. "clerk.laylock.app" (the key is public: it ships to every browser). */
export function clerkHost(key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ""): string {
  try {
    return atob(key.replace(/^pk_(live|test)_/, "")).replace(/\$$/, "");
  } catch {
    return "";
  }
}

/** Why sign-in isn't loading, in words people can act on. */
export function SignInTrouble() {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const host = clerkHost(key);
  // A production key (pk_live) only works on its own domain: clerk.example.com serves example.com and its subdomains.
  const site = host.replace(/^clerk\./, "");
  const here = typeof window === "undefined" ? "" : window.location.hostname;
  const wrongDomain = key.startsWith("pk_live_") && site && here && here !== site && !here.endsWith(`.${site}`);
  return (
    <div className="banner signintrouble" role="alert">
      <strong>Sign-in isn't loading.</strong>
      {wrongDomain ? (
        <p>
          Accounts on this site are set up for <b>{site}</b>, but this page is open on <b>{here}</b>. Open{" "}
          <a href={`https://${site}${typeof window === "undefined" ? "" : window.location.pathname}`}>{site}</a> to sign in.
        </p>
      ) : (
        <p>
          Something in this browser is blocking it, most often an ad blocker or a strict privacy setting (Brave Shields, Firefox strict
          tracking protection, some Safari extensions). Allow this site in it and reload, or try another browser.
        </p>
      )}
    </div>
  );
}
