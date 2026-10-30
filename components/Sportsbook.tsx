"use client";
// The sportsbook side of LayLock: every game's moneyline, spread and total with the fair price and the best book,
// player props bet straight ranked by EV, and a parlay / same-game parlay pricer that knows which legs move together.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EDGE_EV, MARKET_LABEL, MIN_BOOKS, MODEL_LEAN, fmtAmerican, priceParlay, type GameBoard, type MarketKey, type PropEdge, type SideQuote } from "@/lib/books.ts";
import { correlatedHitProbability, type CorrLeg } from "@/lib/correlation.ts";
import { pct } from "@/lib/format.ts";
import { getProKey, proHeaders } from "@/lib/proClient.ts";
import { STATS, type Sport } from "@/lib/types.ts";

const BOOK_SPORTS: Sport[] = ["NBA", "NFL", "NHL", "MLB", "CFB", "CBB", "UFC"];

interface Data {
  enabled: boolean;
  sample?: boolean;
  games: GameBoard[];
  props: PropEdge[];
  propCount: number;
  locked: boolean;
}

/** One leg of the parlay being built. Prop legs carry what the correlation model needs. */
interface Leg {
  id: string;
  label: string;
  sub: string;
  fair: number;
  price: number;
  /** Same game id for game lines; props use team/opponent. */
  game?: string;
  prop?: CorrLeg;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
const short = (team: string) => team.split(" ").slice(-1)[0];
const fmtScore = (x: number) => (x >= 20 ? Math.round(x) : x.toFixed(1));
const evText = (ev: number) => `${ev >= 0 ? "+" : "−"}${Math.abs(ev * 100).toFixed(1)}%`;

/** LayLock's own read favors this side: the model sits well above the books and the blend still pays at the best price. */
const leans = (s: SideQuote) => s.model !== undefined && s.model - s.fair >= MODEL_LEAN && (s.modelEv ?? -1) >= EDGE_EV;

/** LayLock's EV at the best price: on the blended chance when the team model rates both sides, else the books' fair one. */
const edgeOf = (s: SideQuote) => s.modelEv ?? s.ev;

function sideLabel(key: MarketKey, s: SideQuote) {
  if (key === "totals") return `${s.name} ${s.point}`;
  if (key === "spreads") return `${short(s.name)} ${s.point !== undefined && s.point > 0 ? "+" : ""}${s.point}`;
  return short(s.name);
}

export default function Sportsbook() {
  const [sport, setSport] = useState<Sport>("NBA");
  const [data, setData] = useState<Data | null>(null);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [offered, setOffered] = useState("");

  useEffect(() => {
    let live = true;
    setData(null);
    const load = () =>
      fetch(`/api/sportsbook?sport=${sport}`, { headers: proHeaders() })
        .then((r) => r.json() as Promise<Data>)
        .then((d) => live && setData(d))
        .catch(() => live && setData({ enabled: true, games: [], props: [], propCount: 0, locked: false }));
    load();
    let key = getProKey();
    const onChange = () => {
      if (getProKey() === key) return;
      key = getProKey();
      load();
    };
    window.addEventListener("pickslix:change", onChange);
    return () => {
      live = false;
      window.removeEventListener("pickslix:change", onChange);
    };
  }, [sport]);

  const toggle = (leg: Leg) => setLegs((ls) => (ls.some((l) => l.id === leg.id) ? ls.filter((l) => l.id !== leg.id) : [...ls, leg]));

  const best = useMemo(() => {
    if (!data) return [];
    return data.games
      .flatMap((g) =>
        g.markets.flatMap((m) =>
          m.sides
            .filter((s) => m.books >= MIN_BOOKS && edgeOf(s) >= EDGE_EV)
            .map((s) => ({ g, m, s, score: edgeOf(s) })),
        ),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [data]);

  const gameLeg = (g: GameBoard, key: MarketKey, s: SideQuote): Leg => ({
    id: `${g.id}|${key}|${s.name}`,
    label: `${sideLabel(key, s)} ${key === "h2h" ? "ML" : ""}`.trim(),
    sub: `${short(g.away)} @ ${short(g.home)} · ${MARKET_LABEL[key]}`,
    fair: s.chance ?? s.fair,
    price: s.best.price,
    game: g.id,
  });

  const propLeg = (e: PropEdge): Leg => ({
    id: `prop|${e.id}|${e.side}`,
    label: `${e.player} ${e.side === "OVER" ? "o" : "u"}${e.line}`,
    sub: STATS[e.stat].label,
    fair: e.prob / Math.max(1 - e.push, 1e-9),
    price: e.best.price,
    prop: { player: e.player, stat: e.stat, side: e.side, prob: e.prob, sport: e.sport, team: e.team, opponent: e.opponent },
  });

  return (
    <div className="sbpage">
      <div className="hero">
        <div>
          <h1>Sportsbook</h1>
          <p className="muted">
            Moneylines, spreads, totals and player props across the books. We take the margin out to get each side&apos;s fair chance, then show
            where the best price beats it.
          </p>
        </div>
      </div>

      <div className="seg sbsports" role="group" aria-label="Sport">
        {BOOK_SPORTS.map((s) => (
          <button key={s} className={sport === s ? "on" : ""} onClick={() => setSport(s)} aria-pressed={sport === s}>
            {s}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="muted">Loading odds…</p>
      ) : !data.enabled ? (
        <section className="sbempty">
          <strong>Sportsbook odds need an Odds API key</strong>
          <p className="muted">
            Add <code>ODDS_API_KEY</code> to turn this page on. Moneylines, spreads and totals for a sport cost 3 credits and are shared by everyone for six
            hours. <Link href="/setup">Setup check</Link>
          </p>
        </section>
      ) : (
        <>
          {data.sample && <p className="fine">Demo odds. Set DATA_SOURCE=espn and an Odds API key for live prices.</p>}

          {best.length > 0 && (
            <section className="sbbest">
              <h2>Best bets right now</h2>
              <small className="muted">Sides where one book pays more than the fair chance is worth, or where LayLock&apos;s team model leans past the market.</small>
              {best.map(({ g, m, s }) => {
                const leg = gameLeg(g, m.key, s);
                const on = legs.some((l) => l.id === leg.id);
                return (
                  <div key={leg.id} className="sbrow">
                    <div>
                      <span className="edgetags">
                        {s.ev >= EDGE_EV && !leans(s) && <span className="edgetag soft">Best price</span>}
                        {leans(s) && <span className="edgetag ripple">Model lean</span>}
                      </span>
                      <strong>
                        {sideLabel(m.key, s)} <span className="muted">{MARKET_LABEL[m.key]}</span>
                      </strong>
                      <small>
                        {fmtAmerican(s.best.price)} at {s.best.book} · fair {pct(s.fair)}
                        {s.model !== undefined ? ` · model ${pct(s.model)}` : ""} · {short(g.away)} @ {short(g.home)}, {when(g.start)}
                      </small>
                    </div>
                    <span className="sbev pos">{evText(edgeOf(s))}</span>
                    <button className={on ? "ghost small" : "small"} onClick={() => toggle(leg)}>
                      {on ? "Added ✓" : "Parlay"}
                    </button>
                  </div>
                );
              })}
            </section>
          )}

          <section className="sbgames">
            <h2>Game lines</h2>
            {!data.games.length && <p className="muted">No {sport} games priced right now.</p>}
            {data.games.map((g) => (
              <div key={g.id} className="sbgame">
                <div className="sbgamehead">
                  <strong>
                    {g.away} <span className="muted">@</span> {g.home}
                  </strong>
                  <small>
                    {g.projected && `LayLock: ${short(g.away)} ${fmtScore(g.projected.away)}, ${short(g.home)} ${fmtScore(g.projected.home)} · `}
                    {when(g.start)}
                  </small>
                </div>
                {g.markets.map((m) => (
                  <div key={m.key} className="sbmarket">
                    <span className="sbmkt">
                      {MARKET_LABEL[m.key]}
                      <small>
                        {m.books} book{m.books === 1 ? "" : "s"}
                        {m.sharp ? " · sharp" : ""}
                      </small>
                    </span>
                    {m.sides.map((s) => {
                      const leg = gameLeg(g, m.key, s);
                      const on = legs.some((l) => l.id === leg.id);
                      const edge = m.books >= MIN_BOOKS && edgeOf(s) >= EDGE_EV;
                      return (
                        <button key={s.name} className={`sbside ${on ? "on" : ""} ${edge ? "edge" : ""}`} onClick={() => toggle(leg)} aria-pressed={on}>
                          <span>{sideLabel(m.key, s)}</span>
                          <strong>{fmtAmerican(s.best.price)}</strong>
                          <small>
                            {s.best.book} · fair {pct(s.fair)}
                            {s.model !== undefined && ` · model ${pct(s.model)}`}
                          </small>
                          {edge && <b className="sbev pos">{evText(edgeOf(s))}</b>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </section>

          <section className="sbprops">
            <h2>Player props, bet straight</h2>
            <small className="muted">The model&apos;s chance at the books&apos; line, against the best price. Positive EV means the price pays more than the chance is worth.</small>
            {!data.propCount && <p className="muted">No {sport} props scored yet today. They show up once lines are posted and scanned.</p>}
            {data.props.map((e) => {
              const leg = propLeg(e);
              const on = legs.some((l) => l.id === leg.id);
              return (
                <div key={leg.id} className="sbrow">
                  <div>
                    <strong>
                      {e.player}{" "}
                      <span className={e.side === "OVER" ? "pos" : "neg"}>
                        {e.side === "OVER" ? "Over" : "Under"} {e.line}
                      </span>{" "}
                      {STATS[e.stat].label}
                    </strong>
                    <small>
                      {fmtAmerican(e.best.price)} at {e.best.book} · model {pct(e.prob)} · {e.team} vs {e.opponent}, {when(e.gameTime)}
                    </small>
                  </div>
                  <span className={`sbev ${e.ev >= 0 ? "pos" : "neg"}`}>{evText(e.ev)}</span>
                  <button className={on ? "ghost small" : "small"} onClick={() => toggle(leg)}>
                    {on ? "Added ✓" : "Parlay"}
                  </button>
                </div>
              );
            })}
            {data.locked && data.propCount > data.props.length && (
              <div className="softcta">
                <strong>{data.propCount - data.props.length} more props ranked by EV</strong>
                <small>Pro shows every prop the books deal, best price first.</small>
                <Link href="/pro" className="button small">
                  Unlock with Pro
                </Link>
              </div>
            )}
          </section>
        </>
      )}

      <Parlay legs={legs} offered={offered} setOffered={setOffered} onRemove={(id) => setLegs((ls) => ls.filter((l) => l.id !== id))} onClear={() => setLegs([])} />

      <p className="fine">
        Fair chances are the books&apos; own prices with the margin removed, Pinnacle and BetOnline counting double. The model chance comes from team
        ratings fitted to this season&apos;s scores; it moves the fair price a quarter of the way at most, since the books know more. Prop chances are
        LayLock&apos;s player model.
        Lines move; check the price at the book before you bet. 21+.
      </p>
    </div>
  );
}

function Parlay({ legs, offered, setOffered, onRemove, onClear }: { legs: Leg[]; offered: string; setOffered: (v: string) => void; onRemove: (id: string) => void; onClear: () => void }) {
  if (!legs.length) {
    return (
      <section className="sbparlay empty">
        <h2>Parlay and SGP pricer</h2>
        <small className="muted">Tap any price to add it. We&apos;ll show the parlay&apos;s fair odds, allowing for same-game props that move together.</small>
      </section>
    );
  }
  const props = legs.filter((l) => l.prop);
  const others = legs.filter((l) => !l.prop);
  const corr = props.length > 1 ? correlatedHitProbability(props.map((l) => ({ ...l.prop!, prob: l.fair }))) : null;
  const joint = (corr ? corr.prob : props.reduce((a, l) => a * l.fair, 1)) * others.reduce((a, l) => a * l.fair, 1);
  const offer = Number(offered.replace("+", ""));
  const r = priceParlay(legs, offered && Number.isFinite(offer) && Math.abs(offer) >= 100 ? offer : undefined, joint);
  // Two game lines from one game (a side and the total) are linked too, but the pricer treats them as unrelated.
  const games = others.map((l) => l.game);
  const sameGameLines = games.some((g, i) => g && games.indexOf(g) !== i);
  return (
    <section className="sbparlay">
      <div className="sliphead">
        <h2>Parlay</h2>
        <span className="count">{legs.length} legs</span>
      </div>
      {legs.map((l) => (
        <div key={l.id} className="leg">
          <div>
            <strong>{l.label}</strong>
            <small>{l.sub}</small>
          </div>
          <span className="num">{fmtAmerican(l.price)}</span>
          <button className="x" onClick={() => onRemove(l.id)} aria-label={`Remove ${l.label}`}>
            ×
          </button>
        </div>
      ))}
      <div className="stat big">
        <span>Fair chance it hits</span>
        <strong>{pct(r.fair, 1)}</strong>
      </div>
      <div className="stat">
        <span>Fair odds</span>
        <strong>{fmtAmerican(r.fairPrice)}</strong>
      </div>
      <div className="stat">
        <span>These prices parlayed</span>
        <strong>{fmtAmerican(r.straightPrice)}</strong>
      </div>
      <div className="inputs">
        <label>
          Book&apos;s price (SGPs are priced their own way)
          <input inputMode="numeric" placeholder={fmtAmerican(r.straightPrice)} value={offered} onChange={(e) => setOffered(e.target.value)} />
        </label>
      </div>
      <p className={`verdict ${r.ev >= 0 ? "good" : "bad"}`}>
        {r.ev >= 0 ? `✓ ${evText(r.ev)} expected: the price pays more than the chance is worth.` : `✗ ${evText(r.ev)} expected: you'd need ${fmtAmerican(r.fairPrice)} or better.`}
      </p>
      {corr && corr.linked.length > 0 && (
        <p className={corr.prob >= corr.independent ? "note" : "warn"}>
          Some props move together, so the chance is {pct(corr.prob, 1)} for those legs rather than {pct(corr.independent, 1)} if they were unrelated.
          {corr.prob >= corr.independent ? " Books price SGPs knowing this; compare their price with the fair odds." : " These legs pull against each other."}
        </p>
      )}
      {sameGameLines && <p className="warn">Two lines from the same game are treated as unrelated here; a favorite and the over usually move together.</p>}
      <div className="actions">
        <button className="ghost" onClick={onClear}>
          Clear
        </button>
      </div>
    </section>
  );
}
