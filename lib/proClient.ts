"use client";
// The browser's side of Pro: the saved Pro key and whether it's active.
import { useEffect, useState } from "react";

const KEY = "pickslix.proKey";
const CACHE = "pickslix.proStatus";

export interface ProStatus {
  /** Pro features are locked on this deployment (Stripe or lifetime codes are set up). */
  required: boolean;
  pro: boolean;
  plan: "monthly" | "yearly" | "lifetime" | null;
}

export function getProKey(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setProKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY, key);
    else localStorage.removeItem(KEY);
    sessionStorage.removeItem(CACHE);
  } catch {}
  window.dispatchEvent(new Event("pickslix:change"));
}

/** Headers that unlock Pro endpoints. */
export const proHeaders = (): Record<string, string> => {
  const key = getProKey();
  return key ? { "x-pro-key": key } : {};
};

export async function fetchProStatus(): Promise<ProStatus> {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE) ?? "null") as (ProStatus & { key: string }) | null;
    if (cached && cached.key === getProKey()) return cached;
  } catch {}
  const res = await fetch("/api/pro/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: getProKey() }),
  });
  const status = (await res.json()) as ProStatus;
  try {
    sessionStorage.setItem(CACHE, JSON.stringify({ ...status, key: getProKey() }));
  } catch {}
  return status;
}

/** Pro status for this browser; null while loading. Updates when the key changes. */
export function usePro(): ProStatus | null {
  const [status, setStatus] = useState<ProStatus | null>(null);
  useEffect(() => {
    const load = () => fetchProStatus().then(setStatus).catch(() => setStatus({ required: false, pro: false, plan: null }));
    load();
    window.addEventListener("pickslix:change", load);
    return () => window.removeEventListener("pickslix:change", load);
  }, []);
  return status;
}

/** True when this browser can use Pro features (or nothing is locked yet). */
export const unlocked = (s: ProStatus | null) => !s || !s.required || s.pro;
