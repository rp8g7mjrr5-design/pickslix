"use client";
// Which pick'em app this person plays, remembered in the browser. Lines, payouts and wording follow it.
import { useEffect, useState } from "react";
import { DEFAULT_PLATFORM, PLATFORMS, PLATFORM_IDS, toPlatform, type PlatformId } from "./platforms.ts";

const KEY = "laylock.platform";

export function getPlatform(): PlatformId {
  try {
    return toPlatform(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_PLATFORM;
  }
}

export function setPlatform(id: PlatformId) {
  try {
    localStorage.setItem(KEY, id);
    window.dispatchEvent(new Event("pickslix:change"));
  } catch {}
}

export function usePlatform(): PlatformId {
  const [id, setId] = useState<PlatformId>(DEFAULT_PLATFORM);
  useEffect(() => {
    const read = () => setId(getPlatform());
    read();
    window.addEventListener("pickslix:change", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("pickslix:change", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return id;
}

/** "Playing on [Pick 6 ▾]" */
export function PlatformPicker() {
  const id = usePlatform();
  return (
    <label className="platformpick">
      Playing on
      <select value={id} onChange={(e) => setPlatform(toPlatform(e.target.value))} aria-label="Pick'em app">
        {PLATFORM_IDS.map((p) => (
          <option key={p} value={p}>
            {PLATFORMS[p].name}
          </option>
        ))}
      </select>
    </label>
  );
}
