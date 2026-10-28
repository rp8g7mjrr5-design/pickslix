// Crowd vs model: which side LayLock players took on each line (counted when a slip is saved), next to the model's
// pick. The interesting lines are where the two disagree. Pure: counting is in app/api/crowd.
import { normName } from "./names.ts";

export interface CrowdCount {
  over: number;
  under: number;
}

/** A line, the same however the player's name is written. */
export const crowdKey = (player: string, stat: string, line: number) => `${normName(player)}|${stat}|${line}`;

/** Hash fields look like "<key>|OVER". */
export function crowdCounts(fields: Record<string, number>): Record<string, CrowdCount> {
  const out: Record<string, CrowdCount> = {};
  for (const [f, n] of Object.entries(fields)) {
    const i = f.lastIndexOf("|");
    const key = f.slice(0, i);
    const side = f.slice(i + 1);
    const c = (out[key] ??= { over: 0, under: 0 });
    if (side === "OVER") c.over += n;
    else if (side === "UNDER") c.under += n;
  }
  return out;
}

/** Too few picks and the crowd's split means nothing. */
export const CROWD_MIN = 5;

/** The crowd's side and share, once enough people have picked the line. */
export function crowdLean(c: CrowdCount | undefined): { side: "OVER" | "UNDER"; share: number; n: number } | null {
  const n = (c?.over ?? 0) + (c?.under ?? 0);
  if (!c || n < CROWD_MIN) return null;
  const side = c.over >= c.under ? "OVER" : "UNDER";
  return { side, share: (side === "OVER" ? c.over : c.under) / n, n };
}

/** Lines where most of the crowd went one way and the model the other. */
export function disagreements<R extends { player: string; stat: string; line: number; pick: "OVER" | "UNDER"; pickProb: number }>(
  rows: R[],
  counts: Record<string, CrowdCount>,
  minShare = 0.6,
) {
  return rows
    .map((r) => ({ row: r, crowd: crowdLean(counts[crowdKey(r.player, r.stat, r.line)]) }))
    .filter((x) => x.crowd && x.crowd.share >= minShare && x.crowd.side !== x.row.pick && x.row.pickProb >= 0.54)
    .sort((a, b) => b.crowd!.n * b.crowd!.share - a.crowd!.n * a.crowd!.share) as { row: R; crowd: NonNullable<ReturnType<typeof crowdLean>> }[];
}
