"use client";
// Bankroll coach pieces: the weekly budget (set on the Tracker) and the slip's suggested entry.
import { useEffect, useState } from "react";
import { chasing, suggestEntry, weekSpent } from "@/lib/bankroll.ts";
import { loadBudget, loadSlips, saveBudget } from "@/lib/storage.ts";

function useBudget() {
  const [budget, setBudget] = useState(0);
  const [spent, setSpent] = useState(0);
  useEffect(() => {
    const read = () => {
      setBudget(loadBudget());
      setSpent(weekSpent(loadSlips()));
    };
    read();
    window.addEventListener("pickslix:change", read);
    return () => window.removeEventListener("pickslix:change", read);
  }, []);
  return { budget, spent };
}

function BudgetInput({ initial, onDone }: { initial: number; onDone: () => void }) {
  const [value, setValue] = useState(initial ? String(initial) : "");
  return (
    <form
      className="budgetform"
      onSubmit={(e) => {
        e.preventDefault();
        saveBudget(Number(value) || 0);
        onDone();
      }}
    >
      <label>
        Weekly budget $
        <input type="number" inputMode="numeric" min={0} value={value} placeholder="50" onChange={(e) => setValue(e.target.value)} autoFocus />
      </label>
      <button className="small">Save</button>
    </form>
  );
}

/** On the slip: what to put in, given the slip's edge and what's left of the week's budget. */
export function EntryCoach({ hit, mult, entry, onUse }: { hit: number; mult: number; entry: number; onUse: (n: number) => void }) {
  const { budget, spent } = useBudget();
  const [editing, setEditing] = useState(false);
  const [chase, setChase] = useState(false);
  useEffect(() => setChase(chasing(loadSlips(), entry)), [entry]);
  if (editing) return <BudgetInput initial={budget} onDone={() => setEditing(false)} />;
  if (!budget)
    return (
      <p className="fine">
        <button className="linkish" onClick={() => setEditing(true)}>
          Set a weekly budget
        </button>{" "}
        and the coach will size each entry for you.
      </p>
    );
  const left = Math.max(0, budget - spent);
  const n = suggestEntry(hit, mult, budget, spent);
  return (
    <div className="coachline">
      <span>
        {!left
          ? `Coach: you've used this week's $${budget}. Sitting out is a win too.`
          : n
            ? `Coach: $${n} fits this slip's edge ($${left} left this week).`
            : "Coach: no edge at this payout, so skip it or keep it small."}
        {chase && <b className="neg"> You've lost your last 3. Bigger entries to win it back usually dig deeper.</b>}
      </span>
      <span className="coachbtns">
        {n > 0 && n !== entry && (
          <button className="ghost small" onClick={() => onUse(n)}>
            Use ${n}
          </button>
        )}
        <button className="linkish" onClick={() => setEditing(true)}>
          Edit
        </button>
      </span>
    </div>
  );
}

/** On the Tracker: this week against the budget. */
export function BudgetCard() {
  const { budget, spent } = useBudget();
  const [editing, setEditing] = useState(false);
  return (
    <section className="report budgetcard">
      <div className="reporthead">
        <h2>This week</h2>
        {!editing && (
          <button className="linkish" onClick={() => setEditing(true)}>
            {budget ? "Change budget" : "Set a budget"}
          </button>
        )}
      </div>
      {editing ? (
        <BudgetInput initial={budget} onDone={() => setEditing(false)} />
      ) : budget ? (
        <>
          <div className="budgetbar" aria-label={`$${spent} of $${budget} used`}>
            <i style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }} className={spent > budget ? "over" : ""} />
          </div>
          <small className={spent > budget ? "neg" : "muted"}>
            ${spent.toFixed(0)} of ${budget} played{spent > budget ? `, $${(spent - budget).toFixed(0)} over budget` : `, $${(budget - spent).toFixed(0)} left`}. Resets Monday.
          </small>
        </>
      ) : (
        <small className="muted">${spent.toFixed(0)} played since Monday. Set a weekly budget and the coach sizes each entry and flags chasing.</small>
      )}
    </section>
  );
}
