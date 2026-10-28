import type { Sport } from "./types.ts";

/** Lowercase, no accents, punctuation or suffixes, so "A.J. Brown" matches "AJ Brown" and "Luka Dončić" matches "Luka Doncic". */
export function normName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const sameName = (a: string, b: string) => normName(a) === normName(b);

/** Team abbreviations as ESPN writes them. Other common spellings map onto these. */
export const TEAMS: Record<Sport, string[]> = {
  NBA: [
    "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GS", "HOU", "IND", "LAC", "LAL", "MEM",
    "MIA", "MIL", "MIN", "NO", "NY", "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SA", "TOR", "UTAH", "WSH",
  ],
  NFL: [
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
    "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WSH",
  ],
  NHL: [
    "ANA", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "COL", "DAL", "DET", "EDM", "FLA", "LA", "MIN", "MTL", "NJ",
    "NSH", "NYI", "NYR", "OTT", "PHI", "PIT", "SEA", "SJ", "STL", "TB", "TOR", "UTAH", "VAN", "VGK", "WPG", "WSH",
  ],
  MLB: [
    "ARI", "ATH", "ATL", "BAL", "BOS", "CHC", "CHW", "CIN", "CLE", "COL", "DET", "HOU", "KC", "LAA", "LAD", "MIA",
    "MIL", "MIN", "NYM", "NYY", "PHI", "PIT", "SD", "SEA", "SF", "STL", "TB", "TEX", "TOR", "WSH",
  ],
  // Hundreds of schools: college teams come from ESPN's search and schedule rather than this list.
  CFB: [],
  CBB: [],
  // Fighters stand in for teams, by last name.
  UFC: [],
};

const ALIASES: Record<Sport, Record<string, string>> = {
  NBA: {
    GSW: "GS", NOP: "NO", NOR: "NO", SAS: "SA", NYK: "NY", UTA: "UTAH", WAS: "WSH", PHO: "PHX", BRK: "BKN",
    BKLYN: "BKN", CHO: "CHA", CHH: "CHA",
  },
  NFL: {
    WAS: "WSH", JAC: "JAX", LA: "LAR", ARZ: "ARI", GNB: "GB", KAN: "KC", NWE: "NE", NOR: "NO", SFO: "SF",
    TAM: "TB", LVR: "LV", OAK: "LV", SD: "LAC",
  },
  NHL: {
    LAK: "LA", NJD: "NJ", SJS: "SJ", TBL: "TB", VEG: "VGK", WAS: "WSH", MON: "MTL", UTA: "UTAH", NAS: "NSH",
    CLB: "CBJ", CLS: "CBJ", WIN: "WPG", ARI: "UTAH",
  },
  MLB: {
    CWS: "CHW", OAK: "ATH", AZ: "ARI", WAS: "WSH", TBR: "TB", SDP: "SD", SFG: "SF", KCR: "KC", LA: "LAD",
    ANA: "LAA", WSN: "WSH", CHA: "CHW", CHN: "CHC", NYA: "NYY", NYN: "NYM",
  },
  CFB: {},
  CBB: {},
  UFC: {},
};

export function canonTeam(abbr: string, sport: Sport): string {
  const up = abbr.trim().toUpperCase();
  return ALIASES[sport]?.[up] ?? up;
}

/** True when the token is a team abbreviation (any spelling) in any sport. */
export function isTeamToken(token: string): boolean {
  const up = token.toUpperCase();
  return (Object.keys(TEAMS) as Sport[]).some((s) => TEAMS[s].includes(up) || up in ALIASES[s]);
}
