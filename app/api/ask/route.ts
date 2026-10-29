import { NextResponse } from "next/server";
import { answerFor, listFor, matchPlayer, readQuestion, type Answer } from "@/lib/ask.ts";
import { buildBoard } from "@/lib/board.ts";
import { loadCalibration } from "@/lib/calibrationData.ts";
import { propContexts } from "@/lib/gameContext.ts";
import { getProvider } from "@/lib/providers.ts";
import { todaysSlate } from "@/lib/slateData.ts";
import { STATS, type Prop, type PropWithProjection } from "@/lib/types.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HELP = "Name a player and, if you can, the stat and line. Try “Is Tatum's 27.5 points safe?” or “Jokic over 11.5 rebounds”.";

async function score(prop: Prop): Promise<PropWithProjection | null> {
  const provider = getProvider();
  const contexts = provider.name === "espn" ? await propContexts([prop], { spend: false }).catch(() => new Map()) : new Map();
  return (await buildBoard([prop], provider, contexts, await loadCalibration()))[0] ?? null;
}

const reply = (row: PropWithProjection | null, answer: Answer | null, list?: string) =>
  NextResponse.json({
    answer,
    list: list ?? null,
    prop: row ? { id: row.id, sport: row.sport, player: row.player, team: row.team, opponent: row.opponent, stat: row.stat, line: row.line, gameTime: row.gameTime } : null,
  });

/** Answer a plain-English question about a player's line from the model's numbers. Body: { question } */
export async function POST(req: Request) {
  const { question } = (await req.json().catch(() => ({}))) as { question?: unknown };
  if (typeof question !== "string" || !question.trim()) return NextResponse.json({ error: HELP }, { status: 400 });
  const q = readQuestion(question.slice(0, 300));
  const slate = (await todaysSlate().catch(() => null))?.rows ?? [];
  const matches = matchPlayer(q.name, slate);

  if (matches.length) {
    const sameStat = q.stat ? matches.filter((r) => r.stat === q.stat) : matches;
    if (!sameStat.length && q.stat && q.line !== undefined) {
      const base = matches[0];
      const row = await score({ ...base, id: `ask-${base.player}-${q.stat}`, stat: q.stat, line: q.line });
      return reply(row, row ? answerFor(row, q.side) : null);
    }
    if (sameStat.length === 1 || (sameStat.length && q.stat)) {
      const base = sameStat[0];
      // A different number than tonight's line: score that one.
      const row = q.line !== undefined && q.line !== base.line ? await score({ ...base, line: q.line }) : base;
      return reply(row, row ? answerFor(row, q.side) : null);
    }
    if (sameStat.length) return reply(null, null, listFor(sameStat));
  }

  // Not on tonight's slate: look the player up, if the question names them fully with a stat and line.
  if (q.stat && q.line !== undefined && q.name.split(" ").length >= 2) {
    const prop = await getProvider()
      .resolve({ sport: STATS[q.stat].sport, player: q.name, stat: q.stat, line: q.line })
      .catch(() => null);
    const row = prop ? await score(prop) : null;
    if (row && row.projection.sampleSize > 0) return reply(row, answerFor(row, q.side));
  }
  return NextResponse.json({ error: matches.length ? HELP : `I couldn't find that player on tonight's board. ${HELP}` });
}
