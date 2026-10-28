// Fetching for MLB matchups (server only; `lib/mlb.ts` holds the pure parts the browser uses too).
import { espnJson, fetchUpcomingGames, findAthlete, type EspnGame } from "./espn.ts";
import { addLines, PARKS, parseBatsThrows, parseSplits, parseTeamBatting, parseWeather, type BatLine, type MlbSlice, type Splits } from "./mlb.ts";
import { STATS, type StatKey } from "./types.ts";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb";
const WEB = "https://site.web.api.espn.com/apis/common/v3/sports/baseball/mlb";
const DAY = 86400;
/** Below this much of a season, last season's numbers fill in at half weight. */
const THIN_AB = 120;
const THIN_TEAM_PA = 1500;

const PITCHER_STATS: StatKey[] = ["K", "OUTS", "HITS_ALLOWED"];
export const isPitcherStat = (stat: StatKey) => PITCHER_STATS.includes(stat) && STATS[stat].sport === "MLB";

/** This season's splits, topped up with last season's early in the year. */
async function loadSplits(athleteId: string): Promise<Splits> {
  const base = `${WEB}/athletes/${athleteId}/splits`;
  const json = await espnJson(base, 6 * 3600);
  const now = parseSplits(json);
  const season = Number(json?.filters?.find((f: any) => f?.name === "season")?.value);
  if (now.all.ab >= THIN_AB || !season) return now;
  const prev = parseSplits(await espnJson(`${base}?season=${season - 1}`, 7 * DAY).catch(() => null));
  return {
    all: addLines(now.all, prev.all, 0.5),
    vsL: addLines(now.vsL, prev.vsL, 0.5),
    vsR: addLines(now.vsR, prev.vsR, 0.5),
    ip: (now.ip ?? 0) + 0.5 * (prev.ip ?? 0),
  };
}

async function batsThrows(athleteId: string) {
  const json = await espnJson(`${WEB}/athletes/${athleteId}`, 7 * DAY);
  return parseBatsThrows(json?.athlete?.displayBatsThrows);
}

async function teamBatting(teamId: string): Promise<BatLine | undefined> {
  const year = new Date().getUTCFullYear();
  const get = (y: number) => espnJson(`${SITE}/teams/${teamId}/statistics?season=${y}&seasontype=2`, 6 * 3600).then(parseTeamBatting, () => undefined);
  const now = await get(year);
  if (now && now.ab + now.bb >= THIN_TEAM_PA) return now;
  const prev = await get(year - 1);
  return now && prev ? addLines(now, prev, 0.5) : (now ?? prev);
}

async function weather(venue: string, gameTime: string) {
  const park = PARKS[venue];
  if (!park || park.roof) return undefined;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${park.lat}&longitude=${park.lon}` +
    "&hourly=temperature_2m,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=GMT&forecast_days=7";
  const res = await fetch(url, { next: { revalidate: 3 * 3600 } } as RequestInit);
  if (!res.ok) return undefined;
  return parseWeather(await res.json(), gameTime);
}

/**
 * The matchup for one player's next game. `game` is from the upcoming schedule; `athleteId` saves a search
 * when the caller already has it.
 */
export async function loadMlbSlice(opts: { player: string; team: string; pitcherProp: boolean; athleteId?: string; game?: EspnGame }): Promise<MlbSlice | null> {
  const game =
    opts.game ?? (await fetchUpcomingGames("MLB").catch(() => [])).find((g) => g.teams.some((t) => t.abbr === opts.team));
  const me = game?.teams.find((t) => t.abbr === opts.team);
  const opp = game?.teams.find((t) => t.abbr !== opts.team);
  const home = game?.teams.find((t) => t.home);
  if (!game || !me || !opp || !home) return null;
  const slice: MlbSlice = { venue: home.abbr, team: me.abbr, pitcherProp: opts.pitcherProp };
  const tasks: Promise<unknown>[] = [weather(home.abbr, game.date).then((w) => w && (slice.weather = w), () => {})];
  if (opts.pitcherProp) {
    if (opp.id) tasks.push(teamBatting(opp.id).then((line) => line && (slice.lineup = { team: opp.abbr, line }), () => {}));
  } else {
    if (opp.pitcher) {
      const p = opp.pitcher;
      tasks.push(
        Promise.all([loadSplits(p.id), batsThrows(p.id).catch(() => ({}))]).then(
          ([sp, bt]) => (slice.starter = { name: p.name, throws: (bt as { throws?: "L" | "R" }).throws, against: sp.all, ip: sp.ip ?? 0 }),
          () => {},
        ),
      );
    }
    tasks.push(
      (async () => {
        const id = opts.athleteId ?? (await findAthlete(opts.player, "MLB", [opts.team]))?.id;
        if (!id) return;
        const [sp, bt] = await Promise.all([loadSplits(id), batsThrows(id).catch(() => ({}))]);
        slice.batter = { bats: (bt as { bats?: "L" | "R" | "S" }).bats, all: sp.all, vsL: sp.vsL, vsR: sp.vsR };
      })().catch(() => {}),
    );
  }
  await Promise.all(tasks);
  return slice;
}
