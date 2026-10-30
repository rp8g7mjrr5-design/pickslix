"use client";
// Sportsbook bets on the Tracker: straight bets and parlays saved from the Sportsbook page, settled from the
// scores, with profit, ROI and what the bets were expected to make at the prices taken.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fmtAmerican } from "@/lib/books.ts";
import { betExpected, betProfit, betStats, type BetLeg, type SavedBet } from "@/lib/bets.ts";
import { persistBets, pullBets } from "@/lib/betStorage.ts";
import { pct } from "@/lib/format.ts";

const RESULTS: NonNullable<BetLeg["result"]>[] = ["hit", "miss", "push"];
const money = (x: number) => `${x >= 0 ? "+" : "−"}$${Math.abs(x).toFixed(2)}`;
const LABEL: Record<NonNullable<BetLeg["result"]>, string> = { hit: "✓ Won", miss: "✗ Lost", push: "Push" };

export default function Bets() {
  const [bets, setBets] = useState<SavedBet[] | null>(null);
  const graded = useRef(false);

  const update = (next: SavedBet[]) => {
    setBets(next);
    persistBets(next);
  };

  useEffect(() => {
    pullBets().then(async (bs) => {
      setBets(bs);
      if (graded.current) return;
      graded.current = true;
      // Settle legs whose games have started and aren't graded yet.
      const open = bs.flatMap((b) => b.legs.filter((l) => !l.result && Date.parse(l.start) < Date.now()).map((l) => ({ bet: b.id, leg: l })));
      if (!open.length) return;
      const res = await fetch("/api/bets/grade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ legs: open.map((o) => o.leg) }) })
        .then((r) => r.json() as Promise<{ graded: ({ result: BetLeg["result"]; actual?: string } | null)[] }>)
        .catch(() => null);
      if (!res) return;
      const found = new Map(open.map((o, i) => [`${o.bet}|${o.leg.id}`, res.graded[i]]));
      const latest = await pullBets();
      update(
        latest.map((b) => ({
          ...b,
          legs: b.legs.map((l) => {
            const g = found.get(`${b.id}|${l.id}`);
            return g && !l.result ? { ...l, result: g.result, actual: g.actual, auto: true } : l;
          }),
        })),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bets) return null;
  const s = betStats(bets);

  const mark = (betId: string, legId: string, result: BetLeg["result"]) =>
    update(bets.map((b) => (b.id !== betId ? b : { ...b, legs: b.legs.map((l) => (l.id === legId ? { ...l, result: l.result === result ? undefined : result, auto: false } : l)) })));
  const setTerms = (betId: string, t: Pick<SavedBet, "stake" | "odds" | "book">) =>
    update(bets.map((b) => (b.id !== betId ? b : { ...b, ...t, editedAt: new Date().toISOString() })));
  const remove = (b: SavedBet) => {
    if (!confirm("Delete this bet? This can't be undone.")) return;
    update(bets.filter((x) => x.id !== b.id));
  };

  return (
    <section className="report bets" id="bets">
      <div className="reporthead">
        <h2>Sportsbook bets</h2>
        <small className="muted">Straight bets and parlays saved from the <Link href="/books">Sportsbook</Link> page. They settle themselves from the final scores.</small>
      </div>
      {!bets.length ? (
        <p className="muted">
          No bets yet. On the <Link href="/books">Sportsbook</Link> page, tap a price, set your stake and tap Save.
        </p>
      ) : (
        <>
          <div className="cards">
            <div className="card">
              <small>Profit</small>
              <strong className={s.profit >= 0 ? "pos" : "neg"}>{money(s.profit)}</strong>
              <small>{s.settled} settled · {s.open} open</small>
            </div>
            <div className="card">
              <small>ROI</small>
              <strong>{s.roi === null ? "—" : pct(s.roi, 1)}</strong>
              <small>on ${s.staked.toFixed(0)} staked</small>
            </div>
            <div className="card">
              <small>Record</small>
              <strong>
                {s.won}–{s.settled - s.won}
              </strong>
              <small>bets won and lost</small>
            </div>
            <div className="card">
              <small>Expected</small>
              <strong className={s.expected >= 0 ? "pos" : "neg"}>{money(s.expected)}</strong>
              <small>at the prices you took</small>
            </div>
          </div>
          {bets.map((b) => (
            <BetCard key={b.id} bet={b} onMark={mark} onTerms={setTerms} onRemove={remove} />
          ))}
          <p className="fine">Expected is what these bets make on average at LayLock&apos;s chances when you placed them. Beating it over time is luck; matching it says the prices were good.</p>
        </>
      )}
    </section>
  );
}

function BetCard({
  bet: b,
  onMark,
  onTerms,
  onRemove,
}: {
  bet: SavedBet;
  onMark: (betId: string, legId: string, r: BetLeg["result"]) => void;
  onTerms: (betId: string, t: Pick<SavedBet, "stake" | "odds" | "book">) => void;
  onRemove: (b: SavedBet) => void;
}) {
  const [fixing, setFixing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [stake, setStake] = useState(String(b.stake));
  const [odds, setOdds] = useState(fmtAmerican(b.odds));
  const [book, setBook] = useState(b.book ?? "");
  const p = betProfit(b);
  const exp = betExpected(b);
  const state = p === null ? "open" : p > 0 ? "won" : p === 0 ? "push" : "lost";
  return (
    <div className={`saved ${state === "push" ? "lost" : state}`}>
      <div className="savedhead">
        <div className="savedtitle">
          <strong>
            {b.legs.length === 1 ? "Straight" : `${b.legs.length}-leg parlay`} · ${b.stake} at {fmtAmerican(b.odds)}
            {b.book ? ` · ${b.book}` : ""}
          </strong>
          <small>
            {new Date(b.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · LayLock {pct(exp.chance)} ·
            expected {money(exp.ev)}
          </small>
        </div>
        <span className={`result ${state === "push" ? "lost" : state}`}>
          {p === null ? `${b.legs.filter((l) => l.result).length}/${b.legs.length} in` : state === "push" ? "Push $0.00" : `${state === "won" ? "Won" : "Lost"} ${money(p)}`}
        </span>
      </div>
      {b.legs.map((l) => (
        <div key={l.id} className="leg">
          <div>
            <strong>{l.label}</strong>
            <small>
              {l.sub} · {fmtAmerican(l.price)}
              {l.actual ? ` · ${l.actual}` : ""}
            </small>
          </div>
          {fixing ? (
            <div className="grade">
              {RESULTS.map((r) => (
                <button key={r} className={l.result === r ? `on ${r}` : ""} onClick={() => onMark(b.id, l.id, r)}>
                  {r === "hit" ? "won" : r === "miss" ? "lost" : r}
                </button>
              ))}
            </div>
          ) : (
            <span className={`legresult ${l.result ?? "open"}`}>{l.result ? LABEL[l.result] : "Pending"}</span>
          )}
        </div>
      ))}
      {editing && (
        <form
          className="termsedit"
          onSubmit={(e) => {
            e.preventDefault();
            const o = Number(odds.replace("+", ""));
            if (!(Number(stake) > 0) || !(Math.abs(o) >= 100)) return;
            onTerms(b.id, { stake: Number(stake), odds: o, book: book.trim() || undefined });
            setEditing(false);
          }}
        >
          <div className="inputs">
            <label>
              Stake $
              <input type="number" inputMode="decimal" min={0.01} step="any" value={stake} onChange={(e) => setStake(e.target.value)} />
            </label>
            <label>
              Odds
              <input inputMode="numeric" value={odds} onChange={(e) => setOdds(e.target.value)} />
            </label>
            <label>
              Book
              <input value={book} onChange={(e) => setBook(e.target.value)} />
            </label>
          </div>
          <div className="actions">
            <button type="submit">Save</button>
            <button type="button" className="ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="savedfoot">
        <button className="linkish" onClick={() => setEditing((v) => !v)}>
          Edit amount
        </button>
        <button className="linkish" onClick={() => setFixing((v) => !v)}>
          {fixing ? "Done" : "Fix a result"}
        </button>
        <button className="linkish" onClick={() => onRemove(b)}>
          Delete
        </button>
      </div>
    </div>
  );
}
