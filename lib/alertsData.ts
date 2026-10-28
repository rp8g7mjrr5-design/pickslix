// Phone alerts (server only): who has turned them on, and the job that checks their open picks and sends.
// Push goes through the browser's own push service (Web Push), signed with this site's VAPID keys.
import webpush from "web-push";
import { alertsFor, legKey, openLegs, type OpenLeg } from "./alerts.ts";
import type { Price } from "./clv.ts";
import { kvDel, kvGet, kvKeys, kvSet } from "./db.ts";
import { fetchInjuries, fetchUpcomingGames, type EspnGame } from "./espn.ts";
import { normName } from "./names.ts";
import { fetchGameLines, oddsEnabled } from "./odds.ts";
import type { SavedSlip } from "./storage.ts";
import type { NewsItem, Sport } from "./types.ts";

export const alertsEnabled = () => Boolean(process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

/** A browser's push subscription, as PushSubscription.toJSON() gives it. */
export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Whose picks to watch: an account, or a signed-out sync code. */
export type Owner = { user: string } | { code: string };

const ownerId = (o: Owner) => ("user" in o ? `user:${o.user}` : `code:${o.code}`);
const subsKey = (o: Owner) => `push:${ownerId(o)}`;
const slipsKey = (id: string) => (id.startsWith("user:") ? `slips:${id}` : `slips:${id.slice("code:".length)}`);
const sentKey = (id: string) => `pushsent:${id}`;
const MAX_SUBS = 5;

export async function addSubscription(o: Owner, sub: PushSub) {
  const subs = ((await kvGet<PushSub[]>(subsKey(o))) ?? []).filter((s) => s.endpoint !== sub.endpoint);
  await kvSet(subsKey(o), [sub, ...subs].slice(0, MAX_SUBS));
}

export async function removeSubscription(o: Owner, endpoint: string) {
  const subs = ((await kvGet<PushSub[]>(subsKey(o))) ?? []).filter((s) => s.endpoint !== endpoint);
  if (subs.length) await kvSet(subsKey(o), subs);
  else await kvDel(subsKey(o));
}

function configure() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:alerts@laylock.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

/** Send to every device of one owner; drops devices the push service says are gone. */
async function sendAll(id: string, subs: PushSub[], payload: { title: string; body: string; url: string; tag?: string }) {
  const alive: PushSub[] = [];
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600 });
      alive.push(sub);
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code !== 404 && code !== 410) alive.push(sub);
    }
  }
  if (alive.length !== subs.length) {
    if (alive.length) await kvSet(`push:${id}`, alive);
    else await kvDel(`push:${id}`);
  }
  return sent;
}

export async function sendTest(o: Owner) {
  if (!alertsEnabled()) return 0;
  configure();
  const subs = (await kvGet<PushSub[]>(subsKey(o))) ?? [];
  return sendAll(ownerId(o), subs, { title: "Alerts are on", body: "We'll buzz you if a player on your slip is ruled out or the line moves.", url: "/tracker" });
}

/** The books' current price for each open leg, from cached lines only (no credits spent). */
async function currentPrices(legs: OpenLeg[]): Promise<Map<string, Price>> {
  const out = new Map<string, Price>();
  if (!oddsEnabled()) return out;
  const games = new Map<Sport, Promise<EspnGame[]>>();
  for (const l of legs) {
    if (!l.openPrice || !l.team) continue;
    if (!games.has(l.sport)) games.set(l.sport, fetchUpcomingGames(l.sport).catch(() => []));
    const g = (await games.get(l.sport)!).find((g) => g.teams.some((t) => t.abbr === l.team));
    const home = g?.teams.find((t) => t.home);
    const away = g?.teams.find((t) => !t.home);
    if (!g || !home || !away) continue;
    const lines = await fetchGameLines(l.sport, home.name || home.abbr, away.name || away.abbr, g.date, { spend: false }).catch(() => ({}));
    const m = (lines as Awaited<ReturnType<typeof fetchGameLines>>)[normName(l.player)]?.[l.stat]?.market;
    if (m) out.set(legKey(l), { line: m.line, pOver: m.pOver });
  }
  return out;
}

/** The scheduled job: check everyone with alerts on and send what's new. */
export async function runAlerts(now = Date.now()) {
  if (!alertsEnabled()) return { enabled: false };
  configure();
  const keys = await kvKeys("push:");
  const news = new Map<Sport, Promise<NewsItem[]>>();
  const newsFor = (s: Sport) => {
    if (!news.has(s)) news.set(s, fetchInjuries(s).catch(() => []));
    return news.get(s)!;
  };
  let owners = 0;
  let sent = 0;
  for (const key of keys) {
    const id = key.slice("push:".length);
    const subs = (await kvGet<PushSub[]>(key).catch(() => null)) ?? [];
    if (!subs.length) continue;
    const slips = (await kvGet<SavedSlip[]>(slipsKey(id)).catch(() => null)) ?? [];
    const legs = openLegs(slips, now);
    if (!legs.length) continue;
    owners++;
    const sports = [...new Set(legs.map((l) => l.sport))];
    const reports = (await Promise.all(sports.map(newsFor))).flat();
    const already = new Set((await kvGet<string[]>(sentKey(id)).catch(() => null)) ?? []);
    const alerts = alertsFor(legs, reports, await currentPrices(legs), already);
    for (const a of alerts) sent += await sendAll(id, subs, { title: a.title, body: a.body, url: a.url, tag: a.id });
    if (alerts.length) await kvSet(sentKey(id), [...already, ...alerts.map((a) => a.id)].slice(-300), 4 * 86400);
  }
  return { enabled: true, watching: keys.length, withOpenPicks: owners, sent };
}
