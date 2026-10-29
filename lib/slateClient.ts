"use client";
// Today's slate and the crowd's picks, fetched once per page load and shared by every component that wants them.
import { useEffect, useState } from "react";
import type { CrowdCount } from "./crowd.ts";
import type { LiteRow } from "./slateLite.ts";

let slate: Promise<LiteRow[]> | undefined;
let crowd: Promise<Record<string, CrowdCount>> | undefined;

const loadSlate = () =>
  (slate ??= fetch("/api/slate")
    .then((r) => r.json() as Promise<{ rows: LiteRow[] }>)
    .then((d) => d.rows ?? [])
    .catch(() => []));

const loadCrowd = () =>
  (crowd ??= fetch("/api/crowd")
    .then((r) => r.json() as Promise<{ counts: Record<string, CrowdCount> }>)
    .then((d) => d.counts ?? {})
    .catch(() => ({})));

export function useSlate(): LiteRow[] {
  const [rows, setRows] = useState<LiteRow[]>([]);
  useEffect(() => {
    let live = true;
    loadSlate().then((r) => live && setRows(r.filter((x) => Date.parse(x.gameTime) > Date.now())));
    return () => {
      live = false;
    };
  }, []);
  return rows;
}

export function useCrowd(): Record<string, CrowdCount> {
  const [counts, setCounts] = useState<Record<string, CrowdCount>>({});
  useEffect(() => {
    let live = true;
    loadCrowd().then((c) => live && setCounts(c));
    return () => {
      live = false;
    };
  }, []);
  return counts;
}

/** Count a saved slip toward the crowd's picks. Fire and forget. */
export function countForCrowd(slipId: string, legs: { player: string; stat: string; line: number; side: string; gameTime?: string }[]) {
  fetch("/api/crowd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slipId, legs: legs.map((l) => ({ player: l.player, stat: l.stat, line: l.line, side: l.side, gameTime: l.gameTime })) }),
  }).catch(() => {});
}
