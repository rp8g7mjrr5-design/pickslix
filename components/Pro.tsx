"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getProKey, setProKey, usePro } from "@/lib/proClient.ts";
import { SignInPrompt, useAccount } from "@/components/Account";

interface Config {
  required: boolean;
  checkout: boolean;
  monthly: boolean;
  yearly: boolean;
  codes: boolean;
  monthlyLabel: string | null;
  yearlyLabel: string | null;
  amounts?: { monthly: Price | null; yearly: Price | null };
}
interface Price {
  amount: number;
  currency: string;
}

const money = (p: Price, perMonth = false) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency.toUpperCase(), minimumFractionDigits: p.amount % 100 ? 2 : 0 }).format(
    (perMonth ? p.amount / 12 : p.amount) / 100,
  );

// What each plan gets, top to bottom. true = included, false = not, a string = included with a note.
const TIERS: { name: string; free: boolean | string; monthly: boolean | string; yearly: boolean | string }[] = [
  { name: "Model odds on every prop", free: true, monthly: true, yearly: true },
  { name: "Game picker and screenshot import", free: true, monthly: true, yearly: true },
  { name: "Tracker with auto-grading", free: true, monthly: true, yearly: true },
  { name: "Crews and the leaderboard", free: true, monthly: true, yearly: true },
  { name: "Pick 6 lines filled in", free: false, monthly: true, yearly: true },
  { name: "Build my best slip", free: false, monthly: true, yearly: true },
  { name: "Insights and model report card", free: false, monthly: true, yearly: true },
  { name: "Export to CSV", free: false, monthly: true, yearly: true },
  { name: "Badge next to your name", free: false, monthly: "Green PRO", yearly: "Gold PRO" },
];

const TIP_URL = process.env.NEXT_PUBLIC_TIP_URL;

const PERKS = [
  ["Pick 6 lines, filled in", "Open any game and every posted line is already set. No typing numbers in."],
  ["Build my best slip", "One tap builds a 2 to 6 pick slip from the model's strongest picks, one per game."],
  ["Your insights", "Profit over time, ROI, streaks, and the stats you hit most (and least)."],
  ["Model report card", "See how often the model's 55%, 60% and 65% picks really hit."],
  ["Export to CSV", "Download every slip and result for your own spreadsheet."],
  ["Support the site", "Pro pays for the live odds feed and keeps LayLock running."],
];

async function post<T>(url: string, body: unknown): Promise<T & { error?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

export default function Pro() {
  const status = usePro();
  const params = useSearchParams();
  const router = useRouter();
  const [config, setConfig] = useState<Config | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [key, setKey] = useState("");
  const [copied, setCopied] = useState(false);
  const account = useAccount();
  // With accounts on, Pro is bought and redeemed while signed in, so it's saved to the account.
  const needSignIn = account.enabled && !account.signedIn;

  useEffect(() => {
    setKey(getProKey());
    fetch("/api/pro/config").then((r) => r.json()).then(setConfig).catch(() => {});
  }, []);

  // Back from Stripe Checkout: turn the payment into a Pro key.
  useEffect(() => {
    const sessionId = params.get("session_id");
    if (!sessionId) return;
    setBusy("claim");
    post<{ key?: string }>("/api/pro/claim", { sessionId })
      .then((r) => {
        if (r.key) {
          setProKey(r.key);
          setKey(r.key);
          setNote(account.signedIn ? "You're Pro. It's saved to your account." : "You're Pro. Save your Pro key below to use it on other devices.");
          router.replace("/pro");
        } else setNote(r.error ?? "Couldn't confirm the payment yet.");
      })
      .catch(() => setNote("Couldn't confirm the payment yet. Refresh in a moment."))
      .finally(() => setBusy(""));
  }, [params, router]);

  const checkout = async (plan: "monthly" | "yearly") => {
    setBusy(plan);
    setNote("");
    const r = await post<{ url?: string }>("/api/pro/checkout", { plan }).catch(() => ({ error: "Couldn't start checkout." }) as { url?: string; error?: string });
    if (r.url) window.location.href = r.url;
    else {
      setNote(r.error ?? "Couldn't start checkout.");
      setBusy("");
    }
  };

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy("code");
    const r = await post<{ key?: string }>("/api/pro/redeem", { code }).catch(() => ({ error: "Try again." }) as { key?: string; error?: string });
    setBusy("");
    if (r.key) {
      setProKey(r.key);
      setKey(r.key);
      setCode("");
      setNote(account.signedIn ? "Lifetime Pro unlocked and saved to your account." : "Lifetime Pro unlocked. Save your Pro key below to use it on other devices.");
    } else setNote(r.error ?? "That code didn't work.");
  };

  const useKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const k = keyInput.trim().toUpperCase();
    if (!k) return;
    setBusy("key");
    const r = await post<{ pro: boolean }>("/api/pro/status", { key: k }).catch(() => ({ pro: false }));
    setBusy("");
    if (r.pro) {
      if (account.signedIn) await post("/api/account/link", { key: k }).catch(() => {});
      setProKey(k);
      setKey(k);
      setKeyInput("");
      setNote(account.signedIn ? "Pro is saved to your account." : "Pro is on for this device.");
    } else setNote("That key isn't active. Check for typos, or renew your subscription.");
  };

  const billing = async () => {
    setBusy("portal");
    const r = await post<{ url?: string }>("/api/pro/portal", { key: getProKey() || key }).catch(() => ({ error: "Try again." }) as { url?: string; error?: string });
    if (r.url) window.location.href = r.url;
    else {
      setNote(r.error ?? "Couldn't open billing.");
      setBusy("");
    }
  };

  const isPro = Boolean(status?.pro);

  return (
    <div className="pro">
      <section className="prohero">
        <span className="probadge">PRO</span>
        <h1>{isPro ? "You're Pro" : "LayLock Pro"}</h1>
        <p className="muted">
          {isPro
            ? `Thanks for supporting LayLock${status?.plan === "lifetime" ? " (lifetime)" : ""}. Everything is unlocked on this device.`
            : "Lines filled in for every game, one-tap best slips, and insights on how you really do."}
        </p>
      </section>

      {note && (
        <p className="note pronote" role="status">
          {note}
        </p>
      )}
      {busy === "claim" && <p className="muted">Confirming your payment…</p>}

      <Tiers
        config={config}
        current={isPro ? (status?.plan ?? "monthly") : "free"}
        canBuy={!isPro && !needSignIn && Boolean(config?.checkout)}
        busy={busy}
        onBuy={checkout}
      />

      {!isPro && needSignIn && (config?.checkout || config?.codes) && account.loaded && (
        <div className="signinprompt">
          <small>Sign in first so Pro is saved to your account and works on all your devices.</small>
          <SignInPrompt>Sign in to get Pro</SignInPrompt>
        </div>
      )}

      {!isPro && config && !config.checkout && !config.codes && (
        <p className="banner">Pro isn't set up on this site yet. Everything is free for now.</p>
      )}

      {isPro && account.signedIn && (
        <section className="prokey">
          <div>
            <strong>Pro is saved to your account</strong>
            <small>Sign in on your phone or any browser and Pro turns on there too.</small>
          </div>
          {status?.plan !== "lifetime" && (
            <div className="prokeyactions">
              <button className="ghost small" onClick={billing} disabled={!!busy}>
                Manage billing
              </button>
            </div>
          )}
        </section>
      )}

      {key && isPro && !account.signedIn && (
        <section className="prokey">
          <div>
            <strong>Your Pro key</strong>
            <small>Enter it on your phone or another browser to unlock Pro there too. Keep it private.</small>
          </div>
          <code>{key}</code>
          <div className="prokeyactions">
            <button
              className="ghost small"
              onClick={() => {
                navigator.clipboard?.writeText(key);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            {status?.plan !== "lifetime" && (
              <button className="ghost small" onClick={billing} disabled={!!busy}>
                Manage billing
              </button>
            )}
            <button
              className="ghost small"
              onClick={() => {
                setProKey("");
                setKey("");
              }}
            >
              Remove from this device
            </button>
          </div>
        </section>
      )}

      {!isPro && !needSignIn && (
        <div className="proforms">
          {config?.codes && (
            <form onSubmit={redeem}>
              <label htmlFor="code">Have a lifetime code?</label>
              <div>
                <input id="code" placeholder="LIFE-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
                <button type="submit" disabled={!!busy}>
                  {busy === "code" ? "Checking…" : "Redeem"}
                </button>
              </div>
            </form>
          )}
          <form onSubmit={useKey}>
            <label htmlFor="key">{account.signedIn ? "Have a Pro key from before? Add it to your account" : "Already Pro on another device?"}</label>
            <div>
              <input id="key" placeholder="LEG-XXXX-XXXX-XXXX" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} autoCapitalize="characters" />
              <button type="submit" className="ghost" disabled={!!busy}>
                {busy === "key" ? "Checking…" : "Use key"}
              </button>
            </div>
          </form>
        </div>
      )}

      <h2 className="perkstitle">What Pro unlocks</h2>
      <div className="perks">
        {PERKS.map(([t, d]) => (
          <div key={t} className="perk">
            <span aria-hidden>✦</span>
            <div>
              <strong>{t}</strong>
              <small>{d}</small>
            </div>
          </div>
        ))}
      </div>

      {TIP_URL && (
        <a className="tipjar" href={TIP_URL} target="_blank" rel="noopener noreferrer">
          <span aria-hidden>☕</span>
          <span>
            <strong>Not ready for Pro? Leave a tip</strong>
            <small>Any amount helps keep the lights on.</small>
          </span>
        </a>
      )}
    </div>
  );
}

const mark = (v: boolean) => (v ? <span className="tick" aria-label="Included">✓</span> : <span className="dash" aria-label="Not included">–</span>);

/** Free, Monthly and Yearly side by side, with what each one gets. */
function Tiers({
  config,
  current,
  canBuy,
  busy,
  onBuy,
}: {
  config: Config | null;
  current: string;
  canBuy: boolean;
  busy: string;
  onBuy: (plan: "monthly" | "yearly") => void;
}) {
  const m = config?.amounts?.monthly;
  const y = config?.amounts?.yearly;
  const monthsFree = m && y ? Math.round(12 - y.amount / m.amount) : 0;
  const plans = [
    { id: "free", title: "Free", price: "Free", sub: "Forever", col: "free" as const },
    {
      id: "monthly",
      title: "Pro Monthly",
      price: config?.monthlyLabel ?? (m ? `${money(m)}/mo` : "Monthly"),
      sub: "Cancel anytime",
      col: "monthly" as const,
      show: config?.monthly ?? true,
    },
    {
      id: "yearly",
      title: "Pro Yearly",
      price: config?.yearlyLabel ?? (y ? `${money(y)}/yr` : "Yearly"),
      sub: y ? `${money(y, true)}/mo, billed yearly` : "Billed yearly",
      col: "yearly" as const,
      show: config?.yearly ?? true,
      flag: monthsFree >= 1 ? `${monthsFree} month${monthsFree === 1 ? "" : "s"} free` : "Best value",
    },
  ].filter((p) => p.show !== false);
  const onLifetime = current === "lifetime";
  return (
    <section className="tiers" aria-label="Plans">
      {plans.map((p) => {
        const isCurrent = current === p.id || (onLifetime && p.id === "yearly");
        return (
          <div key={p.id} className={`tier ${p.id} ${isCurrent ? "current" : ""}`}>
            {p.flag && <span className="tierflag">{p.flag}</span>}
            <span className="tiername">{p.title}</span>
            <strong className="tierprice">{p.price}</strong>
            <small className="muted">{p.sub}</small>
            <ul>
              {TIERS.map((t) => (
                <li key={t.name} className={t[p.col] ? "" : "off"}>
                  {mark(Boolean(t[p.col]))}
                  <span>{t.name}</span>
                  {typeof t[p.col] === "string" && <span className="tierval">{t[p.col]}</span>}
                </li>
              ))}
            </ul>
            {isCurrent ? (
              <span className="tiercurrent">{onLifetime && p.id === "yearly" ? "You have lifetime Pro (gold)" : "Your plan"}</span>
            ) : p.id !== "free" && canBuy ? (
              <button className={p.id === "yearly" ? "" : "ghost"} onClick={() => onBuy(p.id as "monthly" | "yearly")} disabled={!!busy}>
                {busy === p.id ? "Opening checkout…" : `Get ${p.title}`}
              </button>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
