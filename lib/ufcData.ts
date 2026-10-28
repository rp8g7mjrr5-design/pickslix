// Fetching and caching for UFC (server only; `lib/ufc.ts` holds the pure parts the browser uses too).
import { kvGet, kvSet } from "./db.ts";
import { espnJson, type EspnGame, type TeamPlayer } from "./espn.ts";
import { fightLogs, fighterTag, parseFighterStats, parseFights, withAbsorbed, type FightMeta, type FightStats, type UfcInput } from "./ufc.ts";
import type { GameLog } from "./types.ts";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc";
const WEB = "https://site.web.api.espn.com/apis/common/v3/sports/mma";
const KEY = "ufc:fights";
const STALE_MS = 36 * 3600_000;
/** Years of fights kept: enough for a fighter's last several bouts. */
const YEARS = 4;

interface Index {
  updatedAt: string;
  fights: FightMeta[];
}
let inflight: Promise<Map<string, FightMeta>> | null = null;

/** Every UFC fight in the last few years (a year's scoreboard is about 1.5 MB, so the slim index is saved instead). */
export async function refreshUfcFights(): Promise<Map<string, FightMeta>> {
  const year = new Date().getUTCFullYear();
  const boards = await Promise.all(
    Array.from({ length: YEARS }, (_, i) =>
      espnJson(`${SITE}/scoreboard?dates=${year - i}`, i === 0 ? 3600 : 7 * 86400).catch(() => null),
    ),
  );
  const fights = boards.flatMap((b) => parseFights(b)).filter((f) => f.state === "post");
  if (fights.length) await kvSet(KEY, { updatedAt: new Date().toISOString(), fights } satisfies Index, 3 * 86400).catch(() => {});
  return new Map(fights.map((f) => [f.id, f]));
}

export async function loadUfcFights(): Promise<Map<string, FightMeta>> {
  const saved = await kvGet<Index>(KEY).catch(() => null);
  if (saved && Date.now() - Date.parse(saved.updatedAt) < STALE_MS) return new Map(saved.fights.map((f) => [f.id, f]));
  inflight ??= refreshUfcFights()
    .catch(() => new Map(saved?.fights.map((f) => [f.id, f]) ?? []))
    .finally(() => (inflight = null));
  return inflight;
}

/** A fighter's finished UFC fights with per-fight strikes and takedowns, newest first. */
export async function fetchFightLogs(athleteId: string): Promise<GameLog[]> {
  const [stats, fights] = await Promise.all([espnJson(`${WEB}/athletes/${athleteId}/stats`, 3600), loadUfcFights()]);
  return fightLogs(athleteId, parseFighterStats(stats), fights);
}

/** Fights on the next card that haven't finished, each as a two-"team" game (a team is a fighter). */
export async function fetchUfcCard(): Promise<EspnGame[]> {
  const fights = parseFights(await espnJson(`${SITE}/scoreboard`, 600)).filter((f) => f.state !== "post");
  return fights.map((f) => ({
    id: f.id,
    date: f.date,
    state: f.state,
    seasonType: 2,
    teams: f.fighters.map((x, i) => ({
      abbr: fighterTag(x.name),
      id: x.id,
      name: x.name,
      record: x.record,
      // The first listed fighter takes the "home" slot so cards keep ESPN's order.
      home: i === 1,
      stats: { rounds: f.rounds },
    })),
  }));
}

/** This fighter's next fight on the card, with the opponent. */
export async function findNextFight(athleteId: string) {
  const card = await fetchUfcCard();
  const g = card.find((c) => c.teams.some((t) => t.id === athleteId));
  const me = g?.teams.find((t) => t.id === athleteId);
  const opp = g?.teams.find((t) => t.id !== athleteId);
  return g && me && opp ? { game: g, me, opp, rounds: g.teams[0].stats.rounds || 3 } : null;
}

/** Fights of the opponent's to look at for what they give up. */
const DEFENSE_FIGHTS = 6;

/** A fighter's fights with what they absorbed in each, from their recent opponents' stats pages. */
export async function fetchDefenseLogs(athleteId: string): Promise<GameLog[]> {
  const logs = await fetchFightLogs(athleteId);
  const ids = [...new Set(logs.slice(0, DEFENSE_FIGHTS).map((g) => String(g.stats.oppId)).filter((id) => id && id !== "NaN"))];
  const theirs = new Map<string, Map<string, FightStats>>();
  await Promise.all(
    ids.map(async (id) => {
      const json = await espnJson(`${WEB}/athletes/${id}/stats`, 86400).catch(() => null);
      if (json) theirs.set(id, parseFighterStats(json));
    }),
  );
  return withAbsorbed(logs, theirs);
}

/** Rounds and the opponent's fight history (with what they absorbed) for this fighter's next fight. */
export async function loadUfcInput(athleteId: string): Promise<UfcInput | undefined> {
  const next = await findNextFight(athleteId);
  if (!next?.opp.id) return undefined;
  return { rounds: next.rounds, opponent: await fetchDefenseLogs(next.opp.id).catch(() => []) };
}

/** The game picker lists a "team's" players; in the UFC that's the one fighter, with per-fight averages. */
export async function fetchFighter(athleteId: string, name = ""): Promise<TeamPlayer[]> {
  const logs = await fetchFightLogs(athleteId).catch(() => []);
  const recent = logs.slice(0, 5);
  const avg = (f: string) => (recent.length ? Math.round((recent.reduce((s, g) => s + (g.stats[f] ?? 0), 0) / recent.length) * 10) / 10 : 0);
  return [{ id: athleteId, name, pos: recent.length ? `Last ${recent.length}` : "", headshot: `https://a.espncdn.com/i/headshots/mma/players/full/${athleteId}.png`, games: logs.length, avg: recent.length ? { SIG_STR: avg("sigStr"), TD: avg("td") } : {} }];
}
