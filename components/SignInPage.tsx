"use client";

import { SignIn } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { SignInTrouble, useAccount } from "@/components/Account";

/** Only same-site paths, so the link can't bounce people to another site. */
const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

/** A full-page sign-in, for when the top-bar button was tapped before Clerk loaded (or it can't load at all). */
export default function SignInPage() {
  const account = useAccount();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));

  useEffect(() => {
    if (account.signedIn) router.replace(next);
  }, [account.signedIn, next, router]);

  if (!account.enabled) return <p className="banner">Accounts aren't set up on this site. Everything works without signing in.</p>;
  return (
    <div className="signinpage">
      {account.loaded && !account.signedIn && <SignIn routing="hash" forceRedirectUrl={next} />}
      {!account.loaded && (account.failed ? <SignInTrouble /> : <p className="muted">Loading sign-in…</p>)}
    </div>
  );
}
