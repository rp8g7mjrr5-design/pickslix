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
}

const Ctx = createContext<AccountState>({ enabled: false, loaded: true, signedIn: false });
export const useAccount = () => useContext(Ctx);

/** Set when this device's Pro key came from the account, so signing out takes it away again. */
const FROM_ACCOUNT = "pickslix.proFromAccount";

/** Keep the device in step with the account: pick up its Pro key on sign-in, link a device key it lacks. */
async function syncAccount() {
  const res = await fetch("/api/account", { cache: "no-store" });
  const a = (await res.json()) as { signedIn?: boolean; proKey?: string | null; pro?: boolean };
  if (!a.signedIn) return;
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
}

function ClerkBridge({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const signedIn = Boolean(isSignedIn);
  const prev = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isLoaded) return;
    const was = prev.current;
    prev.current = signedIn;
    if (signedIn) syncAccount().catch(() => {});
    else if (was) {
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
  return <Ctx.Provider value={{ enabled: true, loaded: isLoaded, signedIn }}>{children}</Ctx.Provider>;
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
