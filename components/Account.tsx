"use client";
// Accounts (Clerk) on the browser side. Everything here is a no-op when the site has no Clerk keys, so
// components can use useAccount() without checking.
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { getProKey, setProKey } from "@/lib/proClient.ts";
import { forgetAccountSlips } from "@/lib/storage.ts";

export const accountsEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

interface AccountState {
  enabled: boolean;
  /** Clerk has finished loading (always true when accounts are off). */
  loaded: boolean;
  signedIn: boolean;
  /** Listed in ADMIN_EMAILS. */
  admin: boolean;
  /** Leaderboard name, if they picked one. */
  username: string | null;
  setUsername: (name: string | null) => void;
}

const Ctx = createContext<AccountState>({ enabled: false, loaded: true, signedIn: false, admin: false, username: null, setUsername: () => {} });
export const useAccount = () => useContext(Ctx);

/** Set when this device's Pro key came from the account, so signing out takes it away again. */
const FROM_ACCOUNT = "pickslix.proFromAccount";

/** Keep the device in step with the account: pick up its Pro key on sign-in, link a device key it lacks. */
async function syncAccount(): Promise<{ admin: boolean; username: string | null }> {
  const res = await fetch("/api/account", { cache: "no-store" });
  const a = (await res.json()) as { signedIn?: boolean; proKey?: string | null; pro?: boolean; admin?: boolean; username?: string | null };
  const profile = { admin: Boolean(a.admin), username: a.username ?? null };
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
  const signedIn = Boolean(isSignedIn);
  const prev = useRef<boolean | null>(null);
  const [profile, setProfile] = useState<{ admin: boolean; username: string | null }>({ admin: false, username: null });
  useEffect(() => {
    if (!isLoaded) return;
    const was = prev.current;
    prev.current = signedIn;
    if (signedIn) syncAccount().then(setProfile).catch(() => {});
    else setProfile({ admin: false, username: null });
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
    signedIn,
    ...profile,
    setUsername: (username: string | null) => setProfile((p) => ({ ...p, username })),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  return accountsEnabled ? <ClerkBridge>{children}</ClerkBridge> : <>{children}</>;
}

/** Sign-in button or the account menu, for the top bar. Nothing when accounts are off. */
export function AccountButton() {
  const { enabled, loaded, signedIn } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!enabled || !mounted || !loaded) return null;
  if (signedIn) return <UserButton appearance={{ elements: { avatarBox: { width: 32, height: 32 } } }} />;
  return (
    <SignInButton mode="modal">
      <button className="signin">Sign in</button>
    </SignInButton>
  );
}

/** A sign-in prompt for places that need an account. */
export function SignInPrompt({ children }: { children: React.ReactNode }) {
  return (
    <SignInButton mode="modal">
      <button>{children}</button>
    </SignInButton>
  );
}
