"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SignInPrompt, useAccount } from "@/components/Account";
import { pct } from "@/lib/format.ts";
import { MIN_PICKS } from "@/lib/leaderboard.ts";
import { loadCustomProps, saveCustomProps, type SlipLeg } from "@/lib/storage.ts";
import { tailLegs } from "@/lib/tail.ts";
import { STATS } from "@/lib/types.ts";

type Leg = Omit<SlipLeg, "propId" | "auto">;
interface Member {
  memberId: string;
  username: string;
  you: boolean;
  owner: boolean;
  pro: boolean;
  gold?: boolean;
  stats: { picks: number; hits: number; hitRate: number; slips: number; roi: number | null };
  recent: { id: string; createdAt: string; legs: Leg[] }[];
}
interface Data {
  crew: { id: string; name: string; invite: string; owner: boolean };
  members: Member[];
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

export default function Crew({ id }: { id: string }) {
  const account = useAccount();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(
    () =>
      fetch(`/api/crews/${id}`, { cache: "no-store" })
        .then(async (r) => (r.ok ? setData(await r.json()) : setError("This crew doesn't exist, or you're not in it.")))
        .catch(() => setError("Couldn't load the crew.")),
    [id],
  );
  useEffect(() => {
    if (account.signedIn) load();
  }, [account.signedIn, load]);

  const act = async (body: unknown) => {
    const r = await fetch(`/api/crews/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((x) => x.json() as Promise<{ error?: string }>)
      .catch(() => ({ error: "Try again." }));
    if (r.error) setToast(r.error);
    return !r.error;
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const tail = (legs: Leg[], from: string) => {
    const { props, slip, skipped } = tailLegs(legs);
    if (!slip.length) return flash("Those games have already started.");
    const ids = new Set(props.map((p) => p.id));
    saveCustomProps([...props, ...loadCustomProps().filter((p) => !ids.has(p.id))]);
    try {
      localStorage.setItem("pickslix.slip", JSON.stringify(slip));
    } catch {}
    try {
      sessionStorage.setItem("pickslix.tailed", `Tailed ${from}'s slip${skipped ? ` (${skipped} pick${skipped === 1 ? "" : "s"} already started)` : ""}.`);
    } catch {}
    router.push("/#slip");
  };

  if (account.enabled && account.loaded && !account.signedIn) {
    return (
      <div className="crews">
        <h1>Crew</h1>
        <div className="signinprompt">
          <small>Sign in to see this crew.</small>
          <SignInPrompt>Sign in</SignInPrompt>
        </div>
      </div>
    );
  }
  if (error) return <div className="crews"><h1>Crew</h1><p className="muted">{error}</p></div>;
  if (!data) return <div className="crews"><h1>Crew</h1><p className="muted">Loading…</p></div>;

  const link = `${location.origin}/join/${data.crew.invite}`;
  const feed = data.members
    .flatMap((m) => m.recent.map((s) => ({ ...s, member: m })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
  const ranked = data.members.filter((m) => m.stats.picks >= MIN_PICKS);
  const unranked = data.members.filter((m) => m.stats.picks < MIN_PICKS);

  return (
    <div className="crews">
      <div className="hero">
        <div>
          <h1>{data.crew.name}</h1>
          <p className="muted">
            {data.members.length} member{data.members.length === 1 ? "" : "s"} · ranked by hit rate on auto-graded picks
          </p>
        </div>
      </div>

      <div className="invite">
        <div>
          <strong>Invite your crew</strong>
          <small>Anyone with this link can join.</small>
        </div>
        <code>{link}</code>
        <div className="inviteactions">
          <button
            onClick={async () => {
              if (navigator.share) {
                await navigator.share({ title: `Join ${data.crew.name}`, text: `Join my crew "${data.crew.name}"`, url: link }).catch(() => {});
              } else {
                navigator.clipboard?.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
          >
            {copied ? "Copied" : "Share link"}
          </button>
          {data.crew.owner && (
            <button
              className="ghost small"
              onClick={async () => confirm("Make a new link? The old one stops working.") && (await act({ action: "invite" })) && load()}
            >
              New link
            </button>
          )}
        </div>
      </div>

      <section className="report">
        <div className="reporthead">
          <h2>Standings</h2>
          <small>{MIN_PICKS} graded picks to be ranked</small>
        </div>
        <ol className="leaderlist">
          {[...ranked, ...unranked].map((m, i) => (
            <li key={m.memberId} className={`leader ${m.you ? "me" : ""} ${i === 0 && ranked.length ? "top1" : ""}`}>
              <span className="place">{i < ranked.length ? (i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1) : "–"}</span>
              <span className="who">
                <strong>
                  {m.username}
                  {m.pro && <span className={`probadge ${m.gold ? "gold" : ""}`}>PRO</span>}
                  {m.owner && <b className="autotag">owner</b>}
                </strong>
                <small>
                  {m.stats.picks ? `${m.stats.hits}/${m.stats.picks} picks` : "No graded picks yet"}
                </small>
              </span>
              <span className="num">
                <strong>{m.stats.picks ? pct(m.stats.hitRate) : "–"}</strong>
                <small className={m.stats.roi == null ? "muted" : m.stats.roi >= 0 ? "pos" : "neg"}>
                  {m.stats.roi == null ? "" : `${m.stats.roi >= 0 ? "+" : ""}${(m.stats.roi * 100).toFixed(0)}% ROI`}
                </small>
              </span>
              {data.crew.owner && !m.you && (
                <button
                  className="x"
                  aria-label={`Remove ${m.username}`}
                  onClick={async () => confirm(`Remove ${m.username} from the crew?`) && (await act({ action: "remove", memberId: m.memberId })) && load()}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>

      <h2 className="feedhead">Recent slips</h2>
      {!feed.length && (
        <div className="emptycard">
          <p>No slips this week. Save one from the board and it shows up here for your crew.</p>
        </div>
      )}
      {feed.map((s) => {
        const open = s.legs.some((l) => l.gameTime && Date.parse(l.gameTime) > Date.now());
        return (
          <div key={`${s.member.memberId}-${s.id}`} className="saved crewslip">
            <div className="savedhead">
              <strong>{s.member.you ? "You" : s.member.username}</strong>
              <small>
                {s.legs.length}-pick · {ago(s.createdAt)}
              </small>
              {!s.member.you && open && (
                <button className="small" onClick={() => tail(s.legs, s.member.username)}>
                  Tail
                </button>
              )}
            </div>
            {s.legs.map((l, i) => (
              <div key={i} className="leg">
                <div>
                  <strong>{l.player}</strong>
                  <small>
                    <span className={l.side === "OVER" ? "pos" : "neg"}>{l.side === "OVER" ? "More" : "Less"}</span> than {l.line}{" "}
                    {STATS[l.stat]?.label ?? l.stat} · model {pct(l.prob)}
                  </small>
                </div>
                {l.result && <span className={`result ${l.result === "hit" ? "won" : l.result === "miss" ? "lost" : ""}`}>{l.result}</span>}
              </div>
            ))}
          </div>
        );
      })}

      <div className="crewfoot">
        <button
          className="ghost small"
          onClick={async () => confirm(`Leave ${data.crew.name}?`) && (await act({ action: "leave" })) && router.push("/crews")}
        >
          Leave crew
        </button>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
