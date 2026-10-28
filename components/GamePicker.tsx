"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Calibration } from "@/lib/calibration.ts";
import { EnvNote, MarketNote, SplitChips } from "@/components/Insights";
import { project, statValue } from "@/lib/model.ts";
import { nflAdjust, type NflSlice } from "@/lib/nflverse.ts";
import { mlbAdjust, type MlbSlice } from "@/lib/mlb.ts";
import type { UfcInput } from "@/lib/ufc.ts";
import { usageAdjust, type UsageSlice } from "@/lib/usage.ts";
import { splits } from "@/lib/splits.ts";
import { pct } from "@/lib/format.ts";
import { normName } from "@/lib/names.ts";
import { proHeaders } from "@/lib/proClient.ts";
import type { TeamEnv } from "@/lib/odds.ts";
import type { SlipLeg } from "@/lib/storage.ts";
import { SPORTS, STATS, statSport, type DefenseFactors, type GameLog, type NewsItem, type Prop, type Sport, type StatKey } from "@/lib/types.ts";

type GameSport = Sport;

interface OddsLine {
  line: number;
  book: string;
  market?: { line: number; pOver: number; books: number; sharp: boolean };
  open?: number;
}
/** normName(player) → stat → line, from /api/games/lines */
type GameLines = Record<string, Partial<Record<StatKey, OddsLine>>>;

interface Team {
  abbr: string;
  id?: string;
  name?: string;
  logo?: string;
  color?: string;
  record?: string;
  home?: boolean;
}

interface Game {
  id: string;
  date: string;
  state: "pre" | "in" | "post";
  teams: Team[];
}

interface Player {
  id: string;
  name: string;
  pos: string;
  headshot?: string;
  games: number;
  avg: Partial<Record<StatKey, number>>;
  injury?: "out" | "questionable";
}

interface PlayerData {
  logs: GameLog[];
  defense: DefenseFactors;
  news: NewsItem[];
  nfl?: NflSlice | null;
  usage?: UsageSlice;
  ufc?: UfcInput | null;
  mlb?: MlbSlice | null;
  calibration?: Calibration | null;
}

const propId = (player: string, stat: string) => `custom-${player}-${stat}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Stats offered for a player with no season averages yet. */
function statsFor(game: GameSport, pos: string): StatKey[] {
  const sport = statSport(game);
  if (sport === "UFC") return ["SIG_STR", "TD"];
  if (sport === "NBA") return ["PTS", "REB", "AST", "3PM", "PRA", "PR", "PA", "RA"];
  if (sport === "NHL") return pos === "G" ? ["SAVES"] : ["SOG", "NHL_PTS", "GOALS", "NHL_AST"];
  if (sport === "MLB") return /^(SP|RP|P)$/.test(pos) ? ["K", "OUTS", "HITS_ALLOWED"] : ["HITS", "TB", "HRR", "RUNS", "RBI"];
  if (pos === "QB") return ["PASS_YDS", "PASS_TD", "PASS_ATT", "RUSH_YDS"];
  if (pos === "RB") return ["RUSH_YDS", "RUSH_REC_YDS", "REC", "REC_YDS"];
  return ["REC_YDS", "REC", "RUSH_REC_YDS"];
}

/** Pick 6 lines end in .5; start from the player's average. */
const suggestLine = (avg: number) => Math.max(0.5, Math.floor(avg) + 0.5);

const SHORT: Partial<Record<StatKey, string>> = {
  PTS: "PTS", REB: "REB", AST: "AST", "3PM": "3PM", PRA: "PRA", PR: "P+R", PA: "P+A", RA: "R+A",
  PASS_YDS: "Pass yds", PASS_TD: "Pass TD", PASS_ATT: "Pass att", RUSH_YDS: "Rush yds", REC: "Rec",
  REC_YDS: "Rec yds", RUSH_REC_YDS: "Rush+Rec",
  SOG: "SOG", GOALS: "Goals", NHL_AST: "AST", NHL_PTS: "PTS", SAVES: "Saves",
  HITS: "Hits", TB: "TB", HRR: "H+R+RBI", RUNS: "Runs", RBI: "RBI", K: "K", HITS_ALLOWED: "Hits allowed", OUTS: "Outs",
  SIG_STR: "Sig. strikes", TD: "Takedowns",
};

const timeLabel = (g: Game) => {
  if (g.state === "in") return "Live";
  const d = new Date(g.date);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return today ? `Today ${time}` : `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
};

/** Away team first, like a scoreboard. */
const ordered = (g: Game) => [...g.teams].sort((a, b) => Number(a.home ?? false) - Number(b.home ?? false));

export default function GamePicker({
  slip,
  onPick,
  onViewSlip,
  onOpenChange,
}: {
  slip: SlipLeg[];
  onPick: (prop: Prop, side: "OVER" | "UNDER", prob: number) => void;
  onViewSlip: () => void;
  /** A game opened or closed: the board hides its other sections while one is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [games, setGames] = useState<Record<GameSport, Game[]> | null>(null);
  const [failed, setFailed] = useState(false);
  const [sport, setSport] = useState<GameSport>("NBA");
  const [open, setOpen] = useState<Game | null>(null);

  useEffect(() => {
    fetch("/api/games")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((g: Record<GameSport, Game[]>) => {
        setGames(g);
        // Open on the first sport that has games.
        const first = SPORTS.find((s) => g[s]?.length);
        if (first) setSport(first);
      })
      .catch(() => setFailed(true));
  }, []);

  const list = games?.[sport] ?? [];
  const select = (g: Game | null) => {
    setOpen(g);
    onOpenChange?.(Boolean(g));
  };

  return (
    <section className="games" aria-label="Upcoming games">
      <div className="gameshead">
        <div>
          <h2>Pick from upcoming games</h2>
          <small>Tap a game, choose players, set the Pick 6 line.</small>
        </div>
        <div className="seg" role="tablist">
          {SPORTS.filter((s) => !games || games[s]?.length || s === sport).map((s) => (
            <button key={s} role="tab" aria-selected={sport === s} className={sport === s ? "on" : ""} onClick={() => (setSport(s), select(null))}>
              {s}
              {games && <span className="segcount">{games[s]?.length ?? 0}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="gamestrip">
        {!games && !failed &&
          Array.from({ length: 4 }, (_, i) => <div key={i} className="gamecard skeletoncard" aria-hidden />)}
        {failed && <p className="muted gamesempty">Couldn't load games right now.</p>}
        {games && !list.length && <p className="muted gamesempty">No {sport} games in the next few days.</p>}
        {list.map((g) => {
          const [away, home] = ordered(g);
          return (
            <button
              key={g.id}
              className={`gamecard ${open?.id === g.id ? "on" : ""}`}
              aria-pressed={open?.id === g.id}
              onClick={() => select(open?.id === g.id ? null : g)}
              style={teamGlow(away, home)}
            >
              <span className={`gametime ${g.state === "in" ? "live" : ""}`}>{timeLabel(g)}</span>
              <TeamLine team={away} />
              <TeamLine team={home} />
            </button>
          );
        })}
      </div>
      {open && (
        <GameView
          key={open.id}
          game={open}
          sport={sport}
          slip={slip}
          onPick={onPick}
          onClose={() => select(null)}
          onViewSlip={onViewSlip}
        />
      )}
    </section>
  );
}

function teamGlow(a?: Team, b?: Team): React.CSSProperties {
  return {
    "--ca": a?.color ?? "#2a3442",
    "--cb": b?.color ?? "#2a3442",
  } as React.CSSProperties;
}

function TeamLine({ team }: { team?: Team }) {
  if (!team) return null;
  return (
    <span className="teamline">
      <Logo team={team} size={26} />
      <strong>{team.abbr}</strong>
      <small>{team.record}</small>
    </span>
  );
}

function Logo({ team, size }: { team: Team; size: number }) {
  // Fall back to the team's initial if the logo doesn't load (blocked, offline, or missing).
  const [broken, setBroken] = useState(false);
  return team.logo && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={team.logo} alt="" width={size} height={size} className="teamlogo" loading="lazy" onError={() => setBroken(true)} />
  ) : (
    <span className="teamlogo fallback" style={{ width: size, height: size }}>
      {team.abbr.slice(0, 1)}
    </span>
  );
}

/** The open game, right on the page under the game strip: both rosters, lines and the pick card. */
function GameView({
  game,
  sport,
  slip,
  onPick,
  onClose,
  onViewSlip,
}: {
  game: Game;
  sport: GameSport;
  slip: SlipLeg[];
  onPick: (prop: Prop, side: "OVER" | "UNDER", prob: number) => void;
  onClose: () => void;
  onViewSlip: () => void;
}) {
  const [away, home] = ordered(game);
  const [teamIdx, setTeamIdx] = useState(0);
  const [players, setPlayers] = useState<Record<string, Player[] | "error">>({});
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<GameLines>({});
  const [linesLocked, setLinesLocked] = useState(false);
  const [env, setEnv] = useState<{ home: TeamEnv | null; away: TeamEnv | null }>({ home: null, away: null });
  const team = [away, home][teamIdx];
  const opp = [away, home][1 - teamIdx];

  // Load both teams up front so switching is instant.
  useEffect(() => {
    for (const t of [away, home]) {
      if (!t?.id) continue;
      fetch(`/api/games/players?sport=${sport}&team=${t.id}&abbr=${encodeURIComponent(t.abbr)}&name=${encodeURIComponent(t.name ?? "")}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((b: { players: Player[] }) => setPlayers((p) => ({ ...p, [t.abbr]: b.players })))
        .catch(() => setPlayers((p) => ({ ...p, [t.abbr]: "error" })));
    }
    const q = new URLSearchParams({ sport, home: home?.name ?? home?.abbr ?? "", away: away?.name ?? away?.abbr ?? "", date: game.date });
    fetch(`/api/games/lines?${q}`, { headers: proHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((b: { lines?: GameLines; locked?: boolean }) => {
        setLines(b.lines ?? {});
        setLinesLocked(Boolean(b.locked));
      })
      .catch(() => {});
    fetch(`/api/games/env?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setEnv)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, sport]);

  const ref = useRef<HTMLDivElement>(null);
  // Bring the game into view when it opens (the strip stays just above it).
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const roster = players[team.abbr];
  // Players with posted lines first, keeping ESPN's order within each group.
  const hasLine = (p: Player) => Boolean(lines[normName(p.name)]);
  const shown = Array.isArray(roster)
    ? roster
        .filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => Number(hasLine(b)) - Number(hasLine(a)))
    : [];
  const inGame = slip.filter((l) => [away.abbr, home.abbr].includes(slipTeam(l))).length;
  // Fighters meet; teams visit.
  const at = sport === "UFC" ? "vs" : "at";

  return (
    <div className="gameview" ref={ref} aria-label={`${away.abbr} ${at} ${home.abbr}`} style={teamGlow(away, home)}>
        <button className="ghost small backbtn" onClick={onClose}>
          ← All games
        </button>
        <div className="sheethead">
          <div className="matchup">
            <Logo team={away} size={40} />
            <div>
              <strong>
                {away.name || away.abbr} <span className="muted">{at}</span> {home.name || home.abbr}
              </strong>
              <small>
                {sport} · {timeLabel(game)}
              </small>
            </div>
            <Logo team={home} size={40} />
          </div>
        </div>

        <div className="sheettools">
          <div className="seg teamseg" role="tablist">
            {[away, home].map((t, i) => (
              <button
                key={t.abbr}
                role="tab"
                aria-selected={teamIdx === i}
                className={teamIdx === i ? "on" : ""}
                onClick={() => {
                  setTeamIdx(i);
                  setOpenPlayer(null);
                }}
              >
                <Logo team={t} size={18} /> {t.abbr}
              </button>
            ))}
          </div>
          <input type="search" placeholder="Find a player" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a player" />
        </div>

        {linesLocked && (
          <a href="/pro" className="probanner">
            <span>
              <strong>Pick 6 lines, filled in for you</strong>
              <small>Pro loads every posted line for this game.</small>
            </span>
            <b>Get Pro</b>
          </a>
        )}

        <div className="playerlist">
          {roster === undefined &&
            Array.from({ length: 6 }, (_, i) => <div key={i} className="playerrow skeletoncard" aria-hidden />)}
          {roster === "error" && <p className="muted empty">Couldn't load {team.abbr} players.</p>}
          {Array.isArray(roster) && !shown.length && <p className="muted empty">No players found.</p>}
          {shown.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              sport={sport}
              team={team}
              opp={opp}
              gameTime={game.date}
              open={openPlayer === p.id}
              onToggle={() => setOpenPlayer(openPlayer === p.id ? null : p.id)}
              posted={lines[normName(p.name)] ?? {}}
              env={(team.home ? env.home : env.away) ?? undefined}
              slip={slip}
              onPick={onPick}
            />
          ))}
        </div>

        <div className="sheetfoot">
          <span className="muted">
            {slip.length ? `${slip.length} pick${slip.length === 1 ? "" : "s"} in your slip` : "Tap More or Less to add a pick"}
            {inGame ? ` · ${inGame} from this game` : ""}
          </span>
          <button onClick={slip.length ? onViewSlip : onClose}>{slip.length ? "View slip" : "Done"}</button>
        </div>
    </div>
  );
}

/** Legs carry no team, so look it up from the custom props we saved (best effort). */
function slipTeam(l: SlipLeg): string {
  try {
    const props = JSON.parse(localStorage.getItem("pickslix.customProps") ?? "[]") as Prop[];
    return props.find((p) => p.id === l.propId)?.team ?? "";
  } catch {
    return "";
  }
}

const dataCache = new Map<string, Promise<PlayerData>>();

function loadPlayer(sport: GameSport, id: string, name: string, team: string, opp: string, role = ""): Promise<PlayerData> {
  const key = `${sport}:${id}:${opp}:${role}`;
  if (!dataCache.has(key)) {
    const q = new URLSearchParams({ sport, id, name, team, opp, role });
    const p = fetch(`/api/player?${q}`).then(
      (r) => (r.ok ? r.json() : Promise.reject(r.status)),
    );
    p.catch(() => dataCache.delete(key));
    dataCache.set(key, p);
  }
  return dataCache.get(key)!;
}

function PlayerRow({
  player,
  sport,
  team,
  opp,
  gameTime,
  open,
  onToggle,
  posted,
  env,
  slip,
  onPick,
}: {
  player: Player;
  sport: GameSport;
  team: Team;
  opp: Team;
  gameTime: string;
  env?: TeamEnv;
  open: boolean;
  onToggle: () => void;
  posted: Partial<Record<StatKey, OddsLine>>;
  slip: SlipLeg[];
  onPick: (prop: Prop, side: "OVER" | "UNDER", prob: number) => void;
}) {
  const stats = useMemo(() => {
    const withAvg = (Object.keys(STATS) as StatKey[]).filter((k) => player.avg[k] !== undefined);
    const base = withAvg.length ? withAvg : statsFor(sport, player.pos);
    // Stats with a posted line come first.
    const extra = (Object.keys(posted) as StatKey[]).filter((k) => !base.includes(k));
    return [...base, ...extra].sort((a, b) => Number(b in posted) - Number(a in posted));
  }, [player, sport, posted]);
  const picked = slip.filter((l) => stats.some((s) => l.propId === propId(player.name, s)));
  const headline = stats
    .slice(0, 3)
    .filter((s) => player.avg[s] !== undefined)
    .map((s) => `${player.avg[s]} ${SHORT[s]}`)
    .join(" · ");

  const [noPhoto, setNoPhoto] = useState(false);

  return (
    <div className={`playerwrap ${open ? "open" : ""} ${player.injury === "out" ? "isout" : ""}`}>
      <button className="playerrow" onClick={onToggle} aria-expanded={open}>
        {player.headshot && !noPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.headshot} alt="" className="headshot" loading="lazy" onError={() => setNoPhoto(true)} />
        ) : (
          <span className="headshot fallback">{player.name.slice(0, 1)}</span>
        )}
        <span className="pinfo">
          <strong>
            {player.name}
            {player.injury === "out" && <b className="tag out">OUT</b>}
            {player.injury === "questionable" && <b className="tag q">Q</b>}
          </strong>
          <small>
            {player.pos}
            {headline ? ` · ${headline}` : ""}
          </small>
        </span>
        {Object.keys(posted).length > 0 && !picked.length && <span className="linesbadge">{Object.keys(posted).length} lines</span>}
        {picked.length > 0 && <span className="pickedbadge">{picked.length}</span>}
        <span className="chev" aria-hidden>
          ›
        </span>
      </button>
      {open && <PickCard player={player} sport={sport} team={team} opp={opp} gameTime={gameTime} stats={stats} posted={posted} env={env} slip={slip} onPick={onPick} />}
    </div>
  );
}

function PickCard({
  player,
  sport,
  team,
  opp,
  gameTime,
  stats,
  posted,
  env,
  slip,
  onPick,
}: {
  player: Player;
  sport: GameSport;
  team: Team;
  opp: Team;
  gameTime: string;
  stats: StatKey[];
  env?: TeamEnv;
  posted: Partial<Record<StatKey, OddsLine>>;
  slip: SlipLeg[];
  onPick: (prop: Prop, side: "OVER" | "UNDER", prob: number) => void;
}) {
  const [stat, setStat] = useState<StatKey>(stats[0]);
  const [data, setData] = useState<PlayerData | null>(null);
  const [failed, setFailed] = useState(false);
  const [lines, setLines] = useState<Partial<Record<StatKey, number>>>({});

  useEffect(() => {
    // MLB pitchers get the lineup they face; hitters get the starter they face.
    const role = sport === "MLB" && /^(SP|RP|P)$/.test(player.pos) ? "pitcher" : "";
    loadPlayer(sport, player.id, player.name, team.abbr, opp.abbr, role)
      .then(setData)
      .catch(() => setFailed(true));
  }, [sport, player.id, player.name, player.pos, team.abbr, opp.abbr]);

  const id = propId(player.name, stat);
  const leg = slip.find((l) => l.propId === id);
  const recentLogs = useMemo(() => (data?.logs ?? []).filter((g) => g.playing > 0).slice(0, 10), [data]);
  const recent = useMemo(() => recentLogs.map((g) => statValue(g, stat)), [recentLogs, stat]);
  // Logs are newest first, so this season's games are the first `thisSeason` of them.
  const thisSeason = recentLogs.filter((g) => !g.prior).length;
  const fallbackAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : undefined;
  const avg = player.avg[stat] ?? fallbackAvg;
  const postedLine = posted[stat];
  const line =
    leg && !(stat in lines)
      ? leg.line
      : (lines[stat] ?? postedLine?.line ?? (avg !== undefined ? suggestLine(avg) : undefined));

  const prop: Prop | null =
    line === undefined
      ? null
      : { id, sport, player: player.name, team: team.abbr, opponent: opp.abbr, stat, line, gameTime };
  const proj = prop && data ? project({ prop, logs: data.logs, defense: data.defense, news: data.news, market: postedLine?.market, env, adjust: data.nfl ? nflAdjust(prop, data.nfl) : data.mlb ? mlbAdjust(prop.stat, data.mlb) : usageAdjust(prop.stat, data.usage), ufc: data.ufc ?? undefined, calibration: data.calibration }) : null;
  const split = prop && data ? splits(prop, data.logs, { home: team.home, gameTime }) : [];
  const counted = thisSeason < recent.length && thisSeason > 0 ? recent.slice(0, thisSeason) : recent;
  const hits = line === undefined ? 0 : counted.filter((v) => v > line).length;

  const setLine = (v: number) => setLines((l) => ({ ...l, [stat]: Math.max(0.5, Math.round(v * 2) / 2) }));
  const step = statSport(sport) === "NFL" && (stat.includes("YDS") || stat === "PASS_ATT") ? 5 : 1;

  return (
    <div className="pickcard">
      <div className="statchips" role="tablist">
        {stats.map((s) => {
          const on = slip.some((l) => l.propId === propId(player.name, s));
          return (
            <button key={s} role="tab" aria-selected={stat === s} className={`chip ${stat === s ? "on" : ""} ${on ? "inslip" : ""}`} onClick={() => setStat(s)}>
              {SHORT[s] ?? STATS[s].label}
              {posted[s] ? <span className="posted">{posted[s]!.line}</span> : player.avg[s] !== undefined && <span>{player.avg[s]}</span>}
            </button>
          );
        })}
      </div>

      <div className="linerow">
        <div className="stepper">
          <button className="ghost" onClick={() => line !== undefined && setLine(line - step)} aria-label="Lower line">
            −
          </button>
          <label>
            <small>{STATS[stat].label} line</small>
            <input
              type="number"
              inputMode="decimal"
              step={0.5}
              min={0.5}
              value={line ?? ""}
              placeholder="—"
              onChange={(e) => e.target.value && setLines((l) => ({ ...l, [stat]: Number(e.target.value) }))}
              onBlur={() => line !== undefined && setLine(line)}
            />
          </label>
          <button className="ghost" onClick={() => setLine((line ?? 0) + step)} aria-label="Raise line">
            +
          </button>
        </div>
        <div className="linefacts">
          {failed ? (
            <span className="muted">Stats unavailable</span>
          ) : !data ? (
            <span className="muted">Loading games…</span>
          ) : (
            <>
              <span title="What the model expects this player to get">
                Expected <strong className="num">{proj ? proj.mean.toFixed(1) : "—"}</strong>
              </span>
              <span className="muted">
                {!recent.length
                  ? "No recent games"
                  : thisSeason === 0
                    ? "No games this season yet"
                    : thisSeason < recent.length
                      ? `Over in ${hits} of ${thisSeason} this season`
                      : `Over in ${hits} of last ${recent.length}`}
              </span>
            </>
          )}
        </div>
      </div>

      {recent.length > 0 && line !== undefined && <MiniSpark values={recent} line={line} thisSeason={thisSeason} />}
      {thisSeason < recent.length && recent.length > 0 && (
        <small className="hint">Faded bars are last season. They count for less.</small>
      )}
      <small className="hint">
        {postedLine
          ? postedLine.book === "Pick 6"
            ? `Pick 6 line: ${postedLine.line}${line !== postedLine.line ? " (you changed it)" : ""}`
            : `${postedLine.book} line: ${postedLine.line}. Pick 6 hasn't posted this one; adjust if theirs differs.`
          : "No posted line found. We started it at the season average; match it to Pick 6."}
      </small>

      <div className="bigsides">
        {(["OVER", "UNDER"] as const).map((side) => {
          const prob = proj ? (side === "OVER" ? proj.pOver : proj.pUnder) : 0.5;
          const best = proj && proj.pick === side && proj.edge >= 0.03;
          return (
            <button
              key={side}
              className={`bigside ${side.toLowerCase()} ${leg?.side === side ? "selected" : ""} ${best ? "best" : ""}`}
              disabled={!prop}
              aria-pressed={leg?.side === side}
              onClick={() => prop && onPick(prop, side, prob)}
            >
              <span>
                {side === "OVER" ? "More" : "Less"}
                {best && <b className="modelpick">Model pick</b>}
              </span>
              <strong>{proj ? pct(prob) : "—"}</strong>
            </button>
          );
        })}
      </div>
      {proj && <small className="hint">The % is the model's chance that side hits. Tap one to add it to your slip.</small>}
      {proj && line !== undefined && (
        <MarketNote market={postedLine?.market} open={postedLine?.open} line={line} posted={postedLine?.line} proj={proj} />
      )}
      <SplitChips splits={split} />
      <EnvNote env={env} team={team.abbr} />
      {proj && proj.reasons.length > 0 && (
        <ul className="reasons">
          {proj.reasons.slice(0, 4).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MiniSpark({ values, line, thisSeason }: { values: number[]; line: number; thisSeason: number }) {
  const max = Math.max(line * 1.6, ...values, 1);
  const ordered = [...values].reverse();
  // Oldest on the left, so last season's games are the first ones.
  const priorCount = values.length - thisSeason;
  return (
    <div className="minispark" title={`Last ${ordered.length}: ${ordered.join(", ")}`}>
      {ordered.map((v, i) => (
        <i key={i} className={`${v > line ? "over" : "under"} ${i < priorCount ? "prior" : ""}`} style={{ height: `${Math.max(6, (v / max) * 100)}%` }}>
          <em>{v}</em>
        </i>
      ))}
      <b style={{ bottom: `${(line / max) * 100}%` }} />
    </div>
  );
}
