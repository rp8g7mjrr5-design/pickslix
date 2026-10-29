"use client";
// Install as an app: registers the service worker (offline pages, alerts), and from the second visit on offers to
// add LayLock to the Home Screen: the browser's own prompt where there is one, the Share-menu steps on iPhone.
import { useEffect, useState } from "react";

const DISMISSED = "pickslix.installDismissed";
const VISITS = "pickslix.visits";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

export default function Install() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (standalone()) return;
    let visits = 0;
    let dismissed = false;
    try {
      visits = Number(localStorage.getItem(VISITS) ?? 0) + 1;
      localStorage.setItem(VISITS, String(visits));
      dismissed = Boolean(localStorage.getItem(DISMISSED));
    } catch {}
    // First visit is for looking around; ask from the second on.
    if (dismissed || visits < 2) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if (isIos()) setIos(true);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const close = () => {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {}
    setPrompt(null);
    setIos(false);
  };

  if (!prompt && !ios) return null;
  return (
    <div className="installbar" role="dialog" aria-label="Install LayLock">
      <img src="/icon-192.png" alt="" width={36} height={36} />
      <span>
        <strong>Get the LayLock app</strong>
        <small>
          {prompt ? "Opens full screen from your Home Screen, with pick alerts." : "Tap Share, then Add to Home Screen. Opens full screen, with pick alerts."}
        </small>
      </span>
      {prompt && (
        <button
          className="small"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice.catch(() => null);
            close();
          }}
        >
          Install
        </button>
      )}
      <button className="x" onClick={close} aria-label="Not now">
        ×
      </button>
    </div>
  );
}
