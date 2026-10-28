"use client";
import type { SlipLeg } from "./storage.ts";

/**
 * Make a share link for these picks and hand it to the phone's share sheet (or copy it). Resolves to what
 * happened, for a button label: "shared", "copied", or an error to show.
 */
export async function shareSlip(legs: SlipLeg[], hit?: number): Promise<{ ok: true; how: "shared" | "copied"; url: string } | { ok: false; error: string }> {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hit,
      legs: legs.map((l) => ({ player: l.player, stat: l.stat, line: l.line, side: l.side, prob: l.prob, sport: l.sport, team: l.team, opponent: l.opponent, gameTime: l.gameTime })),
    }),
  }).catch(() => null);
  const body = (await res?.json().catch(() => ({}))) as { url?: string; error?: string } | undefined;
  if (!res?.ok || !body?.url) return { ok: false, error: body?.error ?? "Couldn't make a link. Try again." };
  const title = `My ${legs.length}-pick slip on LayLock`;
  if (navigator.share) {
    try {
      await navigator.share({ title, text: title, url: body.url });
      return { ok: true, how: "shared", url: body.url };
    } catch (e) {
      if ((e as Error).name === "AbortError") return { ok: true, how: "shared", url: body.url };
    }
  }
  await navigator.clipboard?.writeText(body.url).catch(() => {});
  return { ok: true, how: "copied", url: body.url };
}
