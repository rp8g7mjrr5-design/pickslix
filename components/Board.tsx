"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GamePicker from "@/components/GamePicker";
import { SplitChips } from "@/components/Insights";
import Welcome from "@/components/Welcome";
import ImportPanel, { type ImportResult } from "@/components/ImportPanel";
import Angles from "@/components/Angles";
import { LockTeaser } from "@/components/DailyLock";
import Edges from "@/components/Edges";
import PickOfDay from "@/components/PickOfDay";
import Pulse from "@/components/Pulse";
import Slip from "@/components/Slip";
import { correlatedHitProbability } from "@/lib/correlation.ts";
import { bestSlip } from "@/lib/bestSlip.ts";
import { proHeaders } from "@/lib/proClient.ts";
import { MAX_PICKS, pct } from "@/lib/format.ts";
import { loadCustomProps, loadSlips, saveCustomProps, type SlipLeg } from "@/lib/storage.ts";
import { SPORTS, STATS, type Prop, type PropWithProjection, type Sport } from "@/lib/types.ts";

type SportFilter = "ALL" | Sport;
type SortKey = "edge" | "time" | "player";

const SLIP_KEY = "pickslix.slip";

const gameTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

const legFor = (r: PropWithProjection, side: "OVER" | "UNDER"): SlipLeg => ({
  propId: r.id,
  player: r.player,
  stat: r.stat,
  line: r.line,
  side,
  prob: side === "OVER" ? r.projection.pOver : r.projection.pUnder,
  rawProb: side === "OVER" ? r.projection.rawPOver : r.projection.rawPUnder,
  openPrice: r.projection.market,
  dispersion: r.projection.dispersion,
});

export default function Board() {
  const [rows, setRows] = useState<PropWithProjection[]>([]);
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [sport, setSport] = useState<SportFilter>("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("edge");
  const [open, setOpen] = useState<string | null>(null);
  const [slip, setSlip] = useState<SlipLeg[]>([]);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState("");
  const [gameOpen, setGameOpen] = useState(false);
  // Whether there's anything to load, so a first visit doesn't flash an empty table.
  const [hasLines, setHasLines] = useState(false);
  const [newHere, setNewHere] = useState(false);
  useEffect(() => {
    setHasLines(loadCustomProps().length > 0);
    setNewHere(!loadCustomProps().length && !loadSlips().length);
  }, []);

  // Keep the slip across reloads.
  useEffect(() => {
    try {
      setSlip(JSON.parse(localStorage.getItem(SLIP_KEY) ?? "[]"));
      // Just tailed a crewmate's slip.
      const tailed = sessionStorage.getItem("pickslix.tailed");
      if (tailed) {
        sessionStorage.removeItem("pickslix.tailed");
        flash(tailed);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SLIP_KEY, JSON.stringify(slip));
      window.dispatchEvent(new Event("pickslix:change"));
    } catch {}
  }, [slip]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const custom = loadCustomProps();
      const [base, mine] = await Promise.all([
        fetch("/api/props").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        custom.length
          ? fetch("/api/props", { method: "POST", headers: proHeaders(), body: JSON.stringify({ props: custom }) }).then((r) =>
              r.ok ? r.json() : Promise.reject(r.status),
            )
          : Promise.resolve({ board: [] }),
      ]);
      const byId = new Map<string, PropWithProjection>();
      for (const r of [...base.board, ...mine.board]) byId.set(r.id, r);
      const next = [...byId.values()];
      setRows(next);
      setProvider(base.provider);
      setUpdated(new Date());
      // Refresh probabilities on legs already in the slip; drop legs whose line is gone.
      setSlip((s) => s.filter((l) => byId.has(l.propId)).map((l) => legFor(byId.get(l.propId)!, l.side)));
      return byId;
    } catch {
      setError("Couldn't load the board. Check your connection and try again.");
      return new Map<string, PropWithProjection>();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const onImported = async (r: ImportResult) => {
    // With nothing added, keep the panel open so its note explains why.
    if (!r.props.length) return;
    const byId = await refresh();
    const picked = Object.entries(r.sides).filter(([id]) => byId.has(id));
    const missing = r.unresolved.length ? ` No stats found for ${r.unresolved.join(", ")}.` : "";
    if (picked.length) {
      setSlip(picked.slice(0, MAX_PICKS).map(([id, side]) => legFor(byId.get(id)!, side)));
      flash(`Loaded ${Math.min(picked.length, MAX_PICKS)} picks into your slip.${missing}`);
    } else {
      flash(`Added ${r.props.length} line${r.props.length === 1 ? "" : "s"}.${missing}`);
    }
    setImporting(false);
  };

  // Picks made from the games list: save the line, put the leg in the slip, then rescore the board.
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Same chance the slip panel shows, same-game links included.
  const slipChance = useMemo(
    () =>
      correlatedHitProbability(
        slip.map((l) => {
          const r = rows.find((x) => x.id === l.propId);
          return { ...l, sport: r?.sport ?? l.sport, team: r?.team || l.team, opponent: r?.opponent || l.opponent };
        }),
      ).prob,
    [slip, rows],
  );

  const pickFromGame = (prop: Prop, side: "OVER" | "UNDER", prob: number) => {
    if (!slip.some((l) => l.propId === prop.id) && slip.length >= MAX_PICKS) return flash(`Pick 6 allows up to ${MAX_PICKS} picks`);
    saveCustomProps([prop, ...loadCustomProps().filter((p) => p.id !== prop.id)]);
    setSlip((s) => {
      const existing = s.find((l) => l.propId === prop.id);
      const rest = s.filter((l) => l.propId !== prop.id);
      if (existing?.side === side && existing.line === prop.line) return rest;
      return [...rest, { propId: prop.id, player: prop.player, stat: prop.stat, line: prop.line, side, prob }];
    });
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, 900);
  };

  const buildBest = (n: number) => {
    const picks = bestSlip(rows, n);
    if (!picks.length) return flash("Not enough strong lines on the board yet. Add a few games first.");
    setSlip(picks.map((r) => legFor(r, r.projection.pick)));
    flash(picks.length < n ? `Only ${picks.length} picks cleared the bar, so your slip has ${picks.length}.` : `Built your best ${n}-pick slip.`);
  };

  const viewSlip = () => document.getElementById("slip")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const removeLine = (id: string) => {
    saveCustomProps(loadCustomProps().filter((p) => p.id !== id));
    setRows((rs) => rs.filter((r) => r.id !== id));
    setSlip((s) => s.filter((l) => l.propId !== id));
  };

  const clearLines = () => {
    if (!confirm("Remove all your lines from the board?")) return;
    saveCustomProps([]);
    setSlip([]);
    refresh();
  };

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    const list = rows.filter(
      (r) =>
        (sport === "ALL" || r.sport === sport) &&
        (!q || `${r.player} ${r.team} ${r.opponent} ${STATS[r.stat].label}`.toLowerCase().includes(q)),
    );
    const byEdge = (a: PropWithProjection, b: PropWithProjection) =>
      Number(a.projection.status === "out") - Number(b.projection.status === "out") || b.projection.edge - a.projection.edge;
    return list.sort(
      sort === "player"
        ? (a, b) => a.player.localeCompare(b.player)
        : sort === "time"
          ? (a, b) => (a.gameTime ?? "~").localeCompare(b.gameTime ?? "~") || byEdge(a, b)
          : byEdge,
    );
  }, [rows, sport, query, sort]);

  const toggleLeg = (r: PropWithProjection, side: "OVER" | "UNDER") => {
    setSlip((s) => {
      const existing = s.find((l) => l.propId === r.id);
      const rest = s.filter((l) => l.propId !== r.id);
      if (existing?.side === side) return rest;
      if (!existing && s.length >= MAX_PICKS) {
        flash(`Pick 6 allows up to ${MAX_PICKS} picks`);
        return s;
      }
      return [...rest, legFor(r, side)];
    });
  };

  const strong = rows.filter((r) => r.projection.status !== "out" && r.projection.edge >= 0.1).length;
  const sports = new Set(rows.map((r) => r.sport));
  const hasMine = rows.some((r) => r.id.startsWith("custom-"));

  return (
    <div className="layout">
      {/* Fixed to the screen, so it lives outside the column that hides everything but the open game. */}
      <Welcome gameOpen={gameOpen} picks={slip.length} />
      <section className={`boardcol ${gameOpen ? "gameopen" : ""}`}>
        {newHere && !slip.length && (
          <div className="intro">
            <h1>Find the Pick 6 picks worth playing.</h1>
            <p>Tap a game, then a player. We give you the odds on More and Less from recent games, the matchup and injury news.</p>
          </div>
        )}
        <PickOfDay slip={slip} onPick={pickFromGame} />
        <Edges slip={slip} onPick={pickFromGame} />
        <LockTeaser />
        <GamePicker slip={slip} onPick={pickFromGame} onViewSlip={viewSlip} onOpenChange={setGameOpen} />
        <Angles slip={slip} onPick={pickFromGame} />

        {rows.length > 0 || importing ? (
          <div className="hero linesHero">
            <div>
              <h1>Your lines</h1>
              <p className="muted">
                {rows.length
                  ? `${rows.length} line${rows.length === 1 ? "" : "s"}${strong ? ` · ${strong} the model likes` : ""}. Tap More or Less to add one to your slip.`
                  : "Paste the lines you see in Pick 6 and we'll score each one."}
              </p>
            </div>
            {!importing && (
              <button className="ghost small" onClick={() => setImporting(true)}>
                Paste lines
              </button>
            )}
          </div>
        ) : (
          !loading && (
            <p className="pastecta">
              Already have lines from Pick 6?{" "}
              <button className="linkish" onClick={() => setImporting(true)}>
                Paste them instead
              </button>
            </p>
          )
        )}

        {provider === "sample" && (
          <p className="banner">Showing sample lines and made-up stats (DATA_SOURCE=sample).</p>
        )}

        {importing && <ImportPanel onImported={onImported} onClose={() => setImporting(false)} />}

        {rows.length > 8 && (
          <div className="toolbar">
            {sports.size > 1 && (
              <div className="tabs" role="tablist">
                {(["ALL", ...SPORTS.filter((x) => sports.has(x))] as SportFilter[]).map((s) => (
                  <button key={s} role="tab" aria-selected={sport === s} className={sport === s ? "active" : ""} onClick={() => setSport(s)}>
                    {s === "ALL" ? "All" : s}
                  </button>
                ))}
              </div>
            )}
            <input
              type="search"
              placeholder="Search players"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search"
            />
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
              <option value="edge">Best picks first</option>
              <option value="time">Game time</option>
              <option value="player">Player A–Z</option>
            </select>
          </div>
        )}

        {error && (
          <div className="error">
            <span>{error}</span>
            <button className="ghost small" onClick={refresh}>
              Try again
            </button>
          </div>
        )}

        {loading && !rows.length && hasLines ? (
          <div className="table">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="rowwrap skeleton">
                <div className="row">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length > 0 ? (
          <div className={`table ${loading ? "stale" : ""}`}>
            <div className="row head" aria-hidden>
              <span>Player</span>
              <span>Prop</span>
              <span>Line</span>
              <span title="What the model expects the player to get">Exp.</span>
              <span>More</span>
              <span>Less</span>
              <span title="Last 10 games; green bars beat the line">Last 10</span>
            </div>
            {visible.map((r) => {
              const p = r.projection;
              const leg = slip.find((l) => l.propId === r.id);
              return (
                <div key={r.id} className={`rowwrap ${p.status === "out" ? "out" : ""} ${open === r.id ? "open" : ""}`}>
                  <div
                    className="row"
                    role="button"
                    tabIndex={0}
                    aria-expanded={open === r.id}
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpen(open === r.id ? null : r.id);
                      }
                    }}
                  >
                    <span className="who">
                      <strong>
                        {r.player}
                        {p.injury === "out" && <b className="tag out">OUT</b>}
                        {p.injury === "questionable" && <b className="tag q">Q</b>}
                      </strong>
                      <small className="mobile-only">
                        {r.line} {STATS[r.stat].label}
                      </small>
                      <small>
                        {r.sport} · {r.team || "?"}
                        {r.opponent ? ` vs ${r.opponent}` : ""}
                        {r.gameTime ? ` · ${gameTimeLabel(r.gameTime)}` : ""}
                      </small>
                    </span>
                    <span>{STATS[r.stat].label}</span>
                    <span className="num">{r.line}</span>
                    <span className="num proj">{p.mean.toFixed(1)}</span>
                    <SideButton
                      label="More"
                      prob={p.pOver}
                      best={p.pick === "OVER" && p.status !== "out"}
                      selected={leg?.side === "OVER"}
                      onClick={() => toggleLeg(r, "OVER")}
                    />
                    <SideButton
                      label="Less"
                      prob={p.pUnder}
                      best={p.pick === "UNDER" && p.status !== "out"}
                      selected={leg?.side === "UNDER"}
                      onClick={() => toggleLeg(r, "UNDER")}
                    />
                    <Spark values={r.recent} line={r.line} thisSeason={r.recentThisSeason} />
                  </div>
                  {open === r.id && (
                    <div className="detail">
                      <div className="detailhead">
                        <span className={`conf ${p.confidence}`}>{p.confidence} confidence</span>
                        <span className="muted">
                          Lean {p.pick === "OVER" ? "More" : "Less"} {pct(p.pickProb)}
                          {p.marketProb !== undefined ? ` · books ${pct(p.marketProb)}` : ""} · hits {pct(p.hitRateLast10)} lately ·{" "}
                          {p.thisSeason !== undefined && p.thisSeason < p.sampleSize
                            ? `${p.thisSeason} games this season + ${p.sampleSize - p.thisSeason} last season`
                            : `${p.sampleSize} games`}
                        </span>
                        {r.id.startsWith("custom-") && (
                          <button className="ghost small" onClick={() => removeLine(r.id)}>
                            Remove line
                          </button>
                        )}
                      </div>
                      <ul>
                        {p.reasons.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                      <SplitChips splits={r.splits} />
                    </div>
                  )}
                </div>
              );
            })}
            {!visible.length && <p className="empty">No lines match.</p>}
          </div>
        ) : null}
        {hasMine && !importing && (
          <p className="pastecta">
            <button className="linkish" onClick={clearLines}>
              Clear all my lines
            </button>
          </p>
        )}
        <Pulse />
      </section>

      <Slip
        legs={slip}
        rows={rows}
        onRemove={(id) => setSlip((s) => s.filter((l) => l.propId !== id))}
        onClear={() => setSlip([])}
        onBest={buildBest}
        onAdd={pickFromGame}
      />

      {slip.length > 0 && (
        <a href="#slip" className="slipbar">
          <span>
            {slip.length} pick{slip.length === 1 ? "" : "s"}
          </span>
          <strong>{pct(slipChance, 1)} to hit</strong>
          <span>View slip ↓</span>
        </a>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function SideButton(props: { label: string; prob: number; best: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button
      className={`side ${props.best ? "best" : ""} ${props.selected ? "selected" : ""}`}
      aria-pressed={props.selected}
      aria-label={`${props.label} ${pct(props.prob)}`}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
    >
      <small className="mobile-only">{props.label}</small>
      {pct(props.prob)}
    </button>
  );
}

function Spark({ values, line, thisSeason }: { values: number[]; line: number; thisSeason?: number }) {
  if (!values.length) return <span className="muted spark-empty">No games</span>;
  const max = Math.max(line * 1.6, ...values, 1);
  // Oldest on the left, so any games from last season come first (and are faded).
  const ordered = [...values].reverse();
  const priorCount = thisSeason === undefined ? 0 : values.length - thisSeason;
  return (
    <span className="spark" title={`Last ${ordered.length}: ${ordered.join(", ")}${priorCount ? ` (first ${priorCount} from last season)` : ""}`}>
      {ordered.map((v, i) => (
        <i key={i} className={`${v > line ? "over" : "under"} ${i < priorCount ? "prior" : ""}`} style={{ height: `${Math.max(6, (v / max) * 100)}%` }} />
      ))}
      <b style={{ bottom: `${(line / max) * 100}%` }} />
    </span>
  );
}
