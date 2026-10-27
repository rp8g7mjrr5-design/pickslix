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
export const TEAMS: Record<"NBA" | "NFL", string[]> = {
  NBA: [
    "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GS", "HOU", "IND", "LAC", "LAL", "MEM",
    "MIA", "MIL", "MIN", "NO", "NY", "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SA", "TOR", "UTAH", "WSH",
  ],
  NFL: [
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
    "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WSH",
  ],
};

const ALIASES: Record<"NBA" | "NFL", Record<string, string>> = {
  NBA: {
    GSW: "GS", NOP: "NO", NOR: "NO", SAS: "SA", NYK: "NY", UTA: "UTAH", WAS: "WSH", PHO: "PHX", BRK: "BKN",
    BKLYN: "BKN", CHO: "CHA", CHH: "CHA",
  },
  NFL: {
    WAS: "WSH", JAC: "JAX", LA: "LAR", ARZ: "ARI", GNB: "GB", KAN: "KC", NWE: "NE", NOR: "NO", SFO: "SF",
    TAM: "TB", LVR: "LV", OAK: "LV", SD: "LAC",
  },
};

export function canonTeam(abbr: string, sport: Sport): string {
  const up = abbr.trim().toUpperCase();
  if (sport !== "NBA" && sport !== "NFL") return up;
  return ALIASES[sport][up] ?? up;
}

/** True when the token is a team abbreviation (any spelling) in either sport. */
export function isTeamToken(token: string): boolean {
  const up = token.toUpperCase();
  return (["NBA", "NFL"] as const).some((s) => TEAMS[s].includes(up) || up in ALIASES[s]);
}
