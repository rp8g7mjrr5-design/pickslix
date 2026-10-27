"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getProKey, setProKey, usePro } from "@/lib/proClient.ts";

interface Config {
  required: boolean;
  checkout: boolean;
  monthly: boolean;
  yearly: boolean;
  codes: boolean;
  monthlyLabel: string | null;
  yearlyLabel: string | null;
}

const TIP_URL = process.env.NEXT_PUBLIC_TIP_URL;

const PERKS = [
  ["Pick 6 lines, filled in", "Open any game and every posted line is already set. No typing numbers in."],
  ["Model report card", "See how often the model's 55%, 60% and 65% picks really hit."],
  ["Support the site", "Pro pays for the live odds feed and keeps LegUp running."],
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
          setNote("You're Pro. Save your Pro key below to use it on other devices.");
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
      setNote("Lifetime Pro unlocked. Save your Pro key below to use it on other devices.");
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
      setProKey(k);
      setKey(k);
      setKeyInput("");
      setNote("Pro is on for this device.");
    } else setNote("That key isn't active. Check for typos, or renew your subscription.");
  };

  const billing = async () => {
    setBusy("portal");
    const r = await post<{ url?: string }>("/api/pro/portal", { key }).catch(() => ({ error: "Try again." }) as { url?: string; error?: string });
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
        <h1>{isPro ? "You're Pro" : "LegUp Pro"}</h1>
        <p className="muted">
          {isPro
            ? `Thanks for supporting LegUp${status?.plan === "lifetime" ? " (lifetime)" : ""}. Everything is unlocked on this device.`
            : "Pick 6 lines filled in for every game, plus the model's report card."}
        </p>
      </section>

      {note && (
        <p className="note pronote" role="status">
          {note}
        </p>
      )}
      {busy === "claim" && <p className="muted">Confirming your payment…</p>}

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

      {!isPro && config?.checkout && (
        <div className="plans">
          {config.monthly && (
            <button className="plan" onClick={() => checkout("monthly")} disabled={!!busy}>
              <span>Monthly</span>
              <strong>{config.monthlyLabel ?? "Subscribe"}</strong>
              <small>{busy === "monthly" ? "Opening checkout…" : "Cancel anytime"}</small>
            </button>
          )}
          {config.yearly && (
            <button className="plan best" onClick={() => checkout("yearly")} disabled={!!busy}>
              <span>Yearly</span>
              <strong>{config.yearlyLabel ?? "Subscribe"}</strong>
              <small>{busy === "yearly" ? "Opening checkout…" : "Best value"}</small>
            </button>
          )}
        </div>
      )}
      {!isPro && config && !config.checkout && !config.codes && (
        <p className="banner">Pro isn't set up on this site yet. Everything is free for now.</p>
      )}

      {key && isPro && (
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

      {!isPro && (
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
            <label htmlFor="key">Already Pro on another device?</label>
            <div>
              <input id="key" placeholder="LEG-XXXX-XXXX-XXXX" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} autoCapitalize="characters" />
              <button type="submit" className="ghost" disabled={!!busy}>
                {busy === "key" ? "Checking…" : "Use key"}
              </button>
            </div>
          </form>
        </div>
      )}

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
