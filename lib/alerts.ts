// Phone alerts on saved picks whose games haven't started: a player ruled out or listed questionable, and the
// sportsbooks moving the line a real amount toward or away from the pick. Each alert goes out once. Pure: the
// checking job is in alertsData.ts.
import { sideChance, type Price } from "./clv.ts";
import { sameName } from "./names.ts";
import type { SavedSlip, SlipLeg } from "./storage.ts";
import { STATS, type NewsItem, type Sport } from "./types.ts";

export interface Alert {
  /** Stable id, so the same alert is never sent twice. */
  id: string;
  title: string;
  body: string;
  url: string;
}

/** A move this big in the books' chance for the pick is worth a buzz (5 points). */
const MOVE = 0.05;
/** How far ahead to watch games. */
const AHEAD_MS = 36 * 3600_000;

export type OpenLeg = SlipLeg & { sport: Sport; gameTime: string };

/** Picks still waiting on a game in the next day and a half, one per distinct prop. */
export function openLegs(slips: SavedSlip[], now = Date.now()): OpenLeg[] {
  const seen = new Map<string, OpenLeg>();
  for (const s of slips) {
    if (!Array.isArray(s?.legs)) continue;
    for (const l of s.legs) {
      const t = Date.parse(l.gameTime ?? "");
      if (l.result || !(t > now && t - now < AHEAD_MS)) continue;
      const sport = l.sport ?? STATS[l.stat]?.sport;
      if (!sport) continue;
      seen.set(legKey(l), { ...l, sport, gameTime: l.gameTime! });
    }
  }
  return [...seen.values()];
}

export const legKey = (l: SlipLeg) => `${l.player.toLowerCase()}|${l.stat}|${l.line}|${l.side}|${(l.gameTime ?? "").slice(0, 10)}`;

const what = (l: SlipLeg) => `${l.player} ${l.side === "OVER" ? "over" : "under"} ${l.line} ${STATS[l.stat]?.label.toLowerCase() ?? l.stat}`;

/**
 * What to tell this person about their open picks. `news` is the injury report for the legs' sports; `prices`
 * holds the books' current price by legKey, where we have one.
 */
export function alertsFor(legs: OpenLeg[], news: NewsItem[], prices: Map<string, Price>, sent: Set<string>): Alert[] {
  const out: Alert[] = [];
  const push = (a: Alert) => !sent.has(a.id) && !out.some((x) => x.id === a.id) && out.push(a);
  for (const l of legs) {
    const key = legKey(l);
    const report = news.find((n) => sameName(n.player, l.player) && (!l.team || !n.team || n.team === l.team));
    if (report?.kind === "player_out")
      push({
        id: `${key}:out`,
        title: `${l.player} is ruled out`,
        body: `Your pick ${what(l)} will likely be voided. Swap it before lock if you can.`,
        url: "/tracker",
      });
    else if (report?.kind === "player_questionable")
      push({
        id: `${key}:q`,
        title: `${l.player} is questionable`,
        body: `${report.headline || "Listed on the injury report"}. Keep an eye on ${what(l)}.`,
        url: "/tracker",
      });

    const now = prices.get(key);
    if (!now || !l.openPrice) continue;
    const d = l.dispersion && l.dispersion > 0 ? l.dispersion : 1.2;
    const diff = sideChance(now, l.line, l.side, d) - sideChance(l.openPrice, l.line, l.side, d);
    if (Math.abs(diff) < MOVE) continue;
    const toward = diff > 0;
    const lineMove = now.line !== l.openPrice.line ? ` (books went ${l.openPrice.line} → ${now.line})` : "";
    push({
      id: `${key}:move:${toward ? "up" : "down"}`,
      title: toward ? `Line moving your way: ${l.player}` : `Line moving against you: ${l.player}`,
      body: `Books now give ${what(l)} ${(sideChance(now, l.line, l.side, d) * 100).toFixed(0)}%, ${toward ? "up" : "down"} ${Math.abs(diff * 100).toFixed(0)} points since you picked it${lineMove}.`,
      url: "/tracker",
    });
  }
  return out;
}
