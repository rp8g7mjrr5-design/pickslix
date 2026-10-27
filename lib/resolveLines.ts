import type { ParsedLine } from "./parseLines.ts";
import { getProvider, resolveFromPaste } from "./providers.ts";
import type { Prop } from "./types.ts";

export interface ImportResult {
  props: Prop[];
  /** Side picked for a prop, when the source showed one (prop id → side). */
  sides: Record<string, "OVER" | "UNDER">;
  skipped: string[];
  /** Players we couldn't look up. Their lines are still imported, just without stats. */
  unresolved: string[];
}

/** Look up each line's player, team and next opponent. A player we can't find is kept as read. */
export async function resolveLines(lines: ParsedLine[], skipped: string[] = []): Promise<ImportResult> {
  const provider = getProvider();
  const resolved = await Promise.all(lines.slice(0, 100).map((l) => provider.resolve(l).catch(() => null)));
  const out: ImportResult = { props: [], sides: {}, skipped, unresolved: [] };
  for (const [i, found] of resolved.entries()) {
    const p = found ?? (await resolveFromPaste(lines[i]));
    if (!found) out.unresolved.push(lines[i].player);
    out.props.push(p);
    if (lines[i].side) out.sides[p.id] = lines[i].side!;
  }
  return out;
}
