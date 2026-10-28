// MLB matchups: who's pitching, which hand, which park, how warm. A hitter's recent games were against a mix of
// pitchers in a mix of parks; tonight is one pitcher in one park. Each piece is a modest multiplier on the
// player's average, shrunk toward league average by how much data is behind it:
// - Opposing starter (hitters): hits and slugging they allow vs league, for the ~2/3 of plate appearances they
//   usually gets. Platoon: the hitter's own numbers against that hand vs overall.
// - Opposing lineup (pitchers): its strikeout rate, average and on-base vs league.
// - Park: run, hit and home-run factors, relative to the parks the player's average already reflects.
// - Weather: temperature at first pitch for open-air parks (warm air carries the ball).
// Pure: fetching is in mlbData.ts.
import type { Adjustment } from "./nflverse.ts";
import type { StatKey } from "./types.ts";

/** League rates the shrinkage pulls toward (recent MLB seasons). */
export const LEAGUE = { avg: 0.245, slg: 0.405, obp: 0.315, k: 0.225 };

export interface Park {
  /** Run, hit and home-run factors, 1 = average (multi-year park factors, rounded). */
  runs: number;
  hits: number;
  hr: number;
  /** Retractable roof or dome: weather is left out. */
  roof?: boolean;
  lat: number;
  lon: number;
}

// Rounded from public multi-year park factors; good to a few percent, which is all the model leans on them for.
export const PARKS: Record<string, Park> = {
  ARI: { runs: 1.01, hits: 1.02, hr: 0.92, roof: true, lat: 33.445, lon: -112.067 },
  ATH: { runs: 1.03, hits: 1.02, hr: 1.08, lat: 38.58, lon: -121.513 },
  ATL: { runs: 1.0, hits: 0.99, hr: 1.03, lat: 33.891, lon: -84.468 },
  BAL: { runs: 1.0, hits: 1.0, hr: 1.02, lat: 39.284, lon: -76.622 },
  BOS: { runs: 1.06, hits: 1.06, hr: 0.97, lat: 42.346, lon: -71.097 },
  CHC: { runs: 1.0, hits: 0.99, hr: 1.01, lat: 41.948, lon: -87.656 },
  CHW: { runs: 1.0, hits: 0.99, hr: 1.07, lat: 41.83, lon: -87.634 },
  CIN: { runs: 1.07, hits: 1.01, hr: 1.24, lat: 39.097, lon: -84.507 },
  CLE: { runs: 0.98, hits: 0.99, hr: 0.95, lat: 41.496, lon: -81.685 },
  COL: { runs: 1.13, hits: 1.12, hr: 1.1, lat: 39.756, lon: -104.994 },
  DET: { runs: 0.98, hits: 1.0, hr: 0.94, lat: 42.339, lon: -83.049 },
  HOU: { runs: 0.99, hits: 0.99, hr: 1.04, roof: true, lat: 29.757, lon: -95.355 },
  KC: { runs: 1.03, hits: 1.05, hr: 0.87, lat: 39.051, lon: -94.481 },
  LAA: { runs: 1.01, hits: 0.99, hr: 1.09, lat: 33.8, lon: -117.883 },
  LAD: { runs: 1.0, hits: 0.97, hr: 1.15, lat: 34.074, lon: -118.24 },
  MIA: { runs: 0.97, hits: 0.98, hr: 0.92, roof: true, lat: 25.778, lon: -80.22 },
  MIL: { runs: 0.99, hits: 0.97, hr: 1.07, roof: true, lat: 43.028, lon: -87.971 },
  MIN: { runs: 1.0, hits: 1.01, hr: 0.98, lat: 44.982, lon: -93.278 },
  NYM: { runs: 0.96, hits: 0.96, hr: 1.0, lat: 40.757, lon: -73.846 },
  NYY: { runs: 1.01, hits: 0.98, hr: 1.15, lat: 40.829, lon: -73.926 },
  PHI: { runs: 1.02, hits: 1.0, hr: 1.1, lat: 39.906, lon: -75.166 },
  PIT: { runs: 0.98, hits: 1.01, hr: 0.86, lat: 40.447, lon: -80.006 },
  SD: { runs: 0.95, hits: 0.96, hr: 0.97, lat: 32.707, lon: -117.157 },
  SEA: { runs: 0.91, hits: 0.93, hr: 0.94, roof: true, lat: 47.591, lon: -122.332 },
  SF: { runs: 0.95, hits: 0.98, hr: 0.82, lat: 37.778, lon: -122.389 },
  STL: { runs: 0.98, hits: 1.0, hr: 0.89, lat: 38.623, lon: -90.193 },
  TB: { runs: 0.97, hits: 0.98, hr: 0.95, roof: true, lat: 27.768, lon: -82.653 },
  TEX: { runs: 0.98, hits: 0.98, hr: 1.01, roof: true, lat: 32.747, lon: -97.084 },
  TOR: { runs: 1.0, hits: 0.99, hr: 1.04, roof: true, lat: 43.641, lon: -79.389 },
  WSH: { runs: 1.0, hits: 1.0, hr: 1.0, lat: 38.873, lon: -77.007 },
};

/** Counting stats behind a batting line (a hitter's, or what hitters did against a pitcher or a lineup). */
export interface BatLine {
  ab: number;
  h: number;
  tb: number;
  bb: number;
  so: number;
  hbp: number;
}

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const emptyLine = (): BatLine => ({ ab: 0, h: 0, tb: 0, bb: 0, so: 0, hbp: 0 });
export const addLines = (a: BatLine, b: BatLine, w = 1): BatLine => ({
  ab: a.ab + w * b.ab, h: a.h + w * b.h, tb: a.tb + w * b.tb, bb: a.bb + w * b.bb, so: a.so + w * b.so, hbp: a.hbp + w * b.hbp,
});

function lineFrom(labels: string[], stats: unknown[]): BatLine {
  const at = (l: string) => num(stats[labels.indexOf(l)]);
  const h = at("H");
  return {
    ab: at("AB"),
    h,
    tb: h + at("2B") + 2 * at("3B") + 3 * at("HR"),
    bb: at("BB"),
    so: at("SO"),
    hbp: at("HBP"),
  };
}

export interface Splits {
  all: BatLine;
  vsL: BatLine;
  vsR: BatLine;
  /** Pitchers: innings this season. */
  ip?: number;
}

/**
 * ESPN's splits page. For a hitter the batting line is their own; for a pitcher, "byOpponentBatting" is what
 * hitters did against them. Both come with vs. Left / vs. Right rows.
 */
export function parseSplits(json: any): Splits {
  const cats: any[] = json?.splitCategories ?? [];
  const pitcher = cats.some((c) => c?.name === "byOpponentBatting");
  // A pitcher's page is labeled with pitching columns, but its batting-against rows use the hitter's columns.
  const labels: string[] = json?.labels ?? [];
  const batLabels = pitcher ? ["AB", "R", "H", "2B", "3B", "HR", "RBI", "BB", "HBP", "SO", "SB", "CS", "AVG", "OBP", "SLG", "OPS"] : labels;
  const out: Splits = { all: emptyLine(), vsL: emptyLine(), vsR: emptyLine() };
  for (const c of cats) {
    for (const s of c?.splits ?? []) {
      const name = String(s?.displayName ?? "");
      if (pitcher && c.name === "split" && name === "All Splits") out.ip = num(s.stats?.[labels.indexOf("IP")]);
      const isBat = pitcher ? c.name === "byOpponentBatting" || c.name === "byRightLeft" : true;
      if (!isBat) continue;
      if (name === "All Splits" && (pitcher || c.name === "split")) out.all = lineFrom(batLabels, s.stats ?? []);
      if (name === "vs. Left") out.vsL = lineFrom(batLabels, s.stats ?? []);
      if (name === "vs. Right") out.vsR = lineFrom(batLabels, s.stats ?? []);
    }
  }
  return out;
}

/** "Left/Right" (bats/throws) → { bats: "L", throws: "R" }. Switch hitters bat "S". */
export function parseBatsThrows(v: unknown): { bats?: "L" | "R" | "S"; throws?: "L" | "R" } {
  const [b, t] = String(v ?? "").split("/").map((x) => x.trim().toLowerCase());
  const hand = (x?: string) => (x?.startsWith("l") ? "L" : x?.startsWith("r") ? "R" : x?.startsWith("s") || x?.startsWith("b") ? "S" : undefined);
  const bats = hand(b);
  const throws = hand(t);
  return { ...(bats ? { bats } : {}), ...(throws && throws !== "S" ? { throws } : {}) };
}

/** A team's season batting from ESPN's team statistics. */
export function parseTeamBatting(json: any): BatLine | undefined {
  const cats: any[] = json?.results?.stats?.categories ?? [];
  const bat = cats.find((c) => c?.name === "batting");
  if (!bat) return undefined;
  const v = (n: string) => num(bat.stats?.find((s: any) => s?.name === n)?.value ?? bat.stats?.find((s: any) => s?.name === n)?.displayValue);
  const line = { ab: v("atBats"), h: v("hits"), tb: v("totalBases"), bb: v("walks"), so: v("strikeouts"), hbp: v("hitByPitch") };
  return line.ab > 0 ? line : undefined;
}

/** Temperature (°F) and wind (mph) at the hour nearest first pitch, from Open-Meteo's hourly forecast. */
export function parseWeather(json: any, gameTime: string): { tempF: number; windMph: number } | undefined {
  const times: string[] = json?.hourly?.time ?? [];
  if (!times.length) return undefined;
  const t = Date.parse(gameTime);
  let best = -1;
  let gap = Infinity;
  times.forEach((x, i) => {
    const d = Math.abs(Date.parse(`${x}Z`) - t);
    if (d < gap) [best, gap] = [i, d];
  });
  if (best < 0 || gap > 3 * 3600_000) return undefined;
  const temp = json.hourly.temperature_2m?.[best];
  if (typeof temp !== "number") return undefined;
  return { tempF: temp, windMph: Number(json.hourly.wind_speed_10m?.[best] ?? 0) };
}

/** Everything the matchup needs for one player's next game, independent of the stat (so the browser can rescore). */
export interface MlbSlice {
  /** Home team of tonight's game (whose park it is) and the player's own team. */
  venue: string;
  team: string;
  pitcherProp: boolean;
  weather?: { tempF: number; windMph: number };
  /** Hitters: tonight's opposing starter. */
  starter?: { name: string; throws?: "L" | "R"; against: BatLine; ip: number };
  /** Hitters: their own lines overall and by pitcher hand. */
  batter?: { bats?: "L" | "R" | "S"; all: BatLine; vsL: BatLine; vsR: BatLine };
  /** Pitchers: the lineup they face. */
  lineup?: { team: string; line: BatLine };
}

/** Share of a hitter's plate appearances the starter usually gets. */
const STARTER_SHARE = 0.65;
/** Prior sample sizes, in at-bats (or plate appearances), that pull each rate toward league or the player's norm. */
const PITCHER_PRIOR_AB = 250;
const PLATOON_PRIOR_AB = 150;
const LINEUP_PRIOR_PA = 800;
const TOTAL_CAP: [number, number] = [0.8, 1.25];

const pa = (l: BatLine) => l.ab + l.bb + l.hbp;
const shrunk = (count: number, n: number, prior: number, priorN: number) => (count + prior * priorN) / (n + priorN);

type Kind = "hits" | "power" | "runs";
const KIND: Partial<Record<StatKey, Kind>> = { HITS: "hits", TB: "power", HRR: "runs", RUNS: "runs", RBI: "runs" };

/** A hitter-side rate ratio vs league for one kind of stat. */
function ratio(l: BatLine, kind: Kind, priorN: number, base = LEAGUE): number {
  const avg = shrunk(l.h, l.ab, base.avg, priorN) / base.avg;
  const slg = shrunk(l.tb, l.ab, base.slg, priorN) / base.slg;
  const obp = shrunk(l.h + l.bb + l.hbp, pa(l), base.obp, priorN) / base.obp;
  return kind === "hits" ? avg : kind === "power" ? slg : (obp + slg) / 2;
}

/** Player's own rates as the "league" a platoon split is measured against. */
function ownBase(l: BatLine) {
  return {
    avg: l.ab ? l.h / l.ab : LEAGUE.avg,
    slg: l.ab ? l.tb / l.ab : LEAGUE.slg,
    obp: pa(l) ? (l.h + l.bb + l.hbp) / pa(l) : LEAGUE.obp,
    k: LEAGUE.k,
  };
}

function parkFactor(p: Park, kind: Kind | "hitsAllowed" | "outs"): number {
  if (kind === "hits" || kind === "hitsAllowed") return p.hits;
  if (kind === "power") return Math.pow(p.hits, 0.6) * Math.pow(p.hr, 0.4);
  if (kind === "outs") return 1 - 0.3 * (p.runs - 1);
  return p.runs;
}

const signed = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(0)}%`;

/** The matchup multiplier for one MLB prop, with the reasons. Undefined when nothing moves it. */
export function mlbAdjust(stat: StatKey, s: MlbSlice | null | undefined): Adjustment | undefined {
  if (!s) return undefined;
  const reasons: string[] = [];
  let factor = 1;
  const apply = (f: number, why: string) => {
    if (!Number.isFinite(f) || Math.abs(f - 1) < 0.01) return;
    factor *= f;
    reasons.push(`${why}: ${signed(f - 1)}`);
  };
  const kind = KIND[stat];
  const pitcherKind = stat === "K" ? "k" : stat === "HITS_ALLOWED" ? "hitsAllowed" : stat === "OUTS" ? "outs" : undefined;

  if (kind && s.starter) {
    const st = s.starter;
    const r = ratio(st.against, kind, PITCHER_PRIOR_AB);
    apply(1 + STARTER_SHARE * (r - 1), `Facing ${st.name}${st.throws ? ` (${st.throws}HP)` : ""}, who has allowed ${(st.against.ab ? st.against.h / st.against.ab : 0).toFixed(3).replace(/^0/, "")} AVG / ${(st.against.ab ? st.against.tb / st.against.ab : 0).toFixed(3).replace(/^0/, "")} SLG`);
    const b = s.batter;
    if (b && st.throws && b.bats && b.bats !== "S" && b.all.ab > 0) {
      const split = st.throws === "L" ? b.vsL : b.vsR;
      const pr = ratio(split, kind, PLATOON_PRIOR_AB, ownBase(b.all));
      apply(1 + STARTER_SHARE * (pr - 1), `Bats ${b.bats} vs a ${st.throws === "L" ? "lefty" : "righty"}: ${(split.ab ? split.tb / split.ab : 0).toFixed(3).replace(/^0/, "")} SLG in ${split.ab} AB vs ${(b.all.tb / b.all.ab).toFixed(3).replace(/^0/, "")} overall`);
    }
  }

  if (pitcherKind && s.lineup) {
    const l = s.lineup.line;
    const n = pa(l);
    const f =
      pitcherKind === "k"
        ? shrunk(l.so, n, LEAGUE.k, LINEUP_PRIOR_PA) / LEAGUE.k
        : pitcherKind === "hitsAllowed"
          ? shrunk(l.h, l.ab, LEAGUE.avg, LINEUP_PRIOR_PA) / LEAGUE.avg
          : 1 - 0.5 * (shrunk(l.h + l.bb + l.hbp, n, LEAGUE.obp, LINEUP_PRIOR_PA) / LEAGUE.obp - 1);
    const what = pitcherKind === "k" ? `strikes out ${n ? ((l.so / n) * 100).toFixed(1) : "?"}% of the time` : pitcherKind === "hitsAllowed" ? `hits ${(l.ab ? l.h / l.ab : 0).toFixed(3).replace(/^0/, "")}` : `gets on base at ${(n ? (l.h + l.bb + l.hbp) / n : 0).toFixed(3).replace(/^0/, "")}`;
    apply(f, `${s.lineup.team}'s lineup ${what}`);
  }

  // Park: tonight's park against the mix the player's average comes from (about half at home, half elsewhere).
  const venue = PARKS[s.venue];
  const home = PARKS[s.team];
  const parkKind = kind ?? (pitcherKind === "hitsAllowed" || pitcherKind === "outs" ? pitcherKind : undefined);
  if (venue && parkKind) {
    const usual = home ? (parkFactor(home, parkKind) + 1) / 2 : 1;
    apply(parkFactor(venue, parkKind) / usual, `${s.venue} park${s.venue === s.team ? " (home)" : ""}`);
  }

  if (venue && !venue.roof && s.weather && (kind || pitcherKind === "hitsAllowed")) {
    const d = s.weather.tempF - 70;
    const per = kind === "power" ? 0.005 : kind === "runs" ? 0.003 : 0.0015;
    const f = Math.min(1.08, Math.max(0.92, 1 + per * d));
    apply(f, `${Math.round(s.weather.tempF)}°F at first pitch${s.weather.windMph >= 15 ? `, wind ${Math.round(s.weather.windMph)} mph` : ""}`);
  }

  if (!reasons.length) return undefined;
  return { factor: Math.min(TOTAL_CAP[1], Math.max(TOTAL_CAP[0], factor)), reasons };
}
