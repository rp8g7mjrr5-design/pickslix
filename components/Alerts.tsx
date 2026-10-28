"use client";
// Turning phone alerts on and off for this device.
import { useEffect, useState } from "react";
import { syncCode } from "@/lib/storage.ts";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type State = "loading" | "unsupported" | "ios-install" | "blocked" | "off" | "on" | "busy";

/** VAPID public key (base64url) → the bytes PushManager wants. */
function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

async function registration() {
  return navigator.serviceWorker.register("/sw.js");
}

export function AlertsToggle() {
  const [state, setState] = useState<State>("loading");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!KEY) return setState("unsupported");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState(isIos() && !standalone() ? "ios-install" : "unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    registration()
      .then((r) => r.pushManager.getSubscription())
      .then((s) => setState(s ? "on" : "off"))
      .catch(() => setState("unsupported"));
  }, []);

  const turnOn = async () => {
    setState("busy");
    setNote("");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
      const reg = await registration();
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }));
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), code: syncCode() }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't turn alerts on.");
      await fetch("/api/alerts/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: syncCode() }) });
      setState("on");
      setNote("You should get a test alert in a moment.");
    } catch (e) {
      setState("off");
      setNote(e instanceof Error ? e.message : "Couldn't turn alerts on.");
    }
  };

  const turnOff = async () => {
    setState("busy");
    try {
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) {
        await fetch("/api/alerts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, code: syncCode() }),
        });
        await sub.unsubscribe();
      }
    } finally {
      setState("off");
      setNote("");
    }
  };

  if (state === "loading" || state === "unsupported") return null;
  return (
    <div className="alerts">
      <div>
        <strong>Pick alerts</strong>
        <small>
          {state === "ios-install"
            ? "On iPhone, add LayLock to your Home Screen first (Share, then Add to Home Screen), open it from there, and turn alerts on."
            : state === "blocked"
              ? "Notifications are blocked for this site. Allow them in your browser or phone settings, then come back."
              : "A buzz on this device when a player on your slip is ruled out or questionable, or the books move the line 5+ points."}
        </small>
        {note && <small className="muted">{note}</small>}
      </div>
      {(state === "off" || state === "busy" || state === "on") && (
        <button className={state === "on" ? "ghost small" : "small"} disabled={state === "busy"} onClick={state === "on" ? turnOff : turnOn}>
          {state === "busy" ? "…" : state === "on" ? "Turn off" : "Turn on"}
        </button>
      )}
    </div>
  );
}
