"use client";
import type { Prop, StatKey } from "./types.ts";

export interface SlipLeg {
  propId: string;
  player: string;
  stat: StatKey;
  line: number;
  side: "OVER" | "UNDER";
  prob: number;
  result?: "hit" | "miss" | "push";
}

export interface SavedSlip {
  id: string;
  createdAt: string;
  entry: number;
  multiplier: number;
  legs: SlipLeg[];
}

const SLIPS = "pickslix.slips";
const CUSTOM = "pickslix.customProps";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode); keep going in memory
  }
}

export const loadSlips = () => read<SavedSlip[]>(SLIPS, []);
export const saveSlips = (s: SavedSlip[]) => write(SLIPS, s);
export const loadCustomProps = () => read<Prop[]>(CUSTOM, []);
export const saveCustomProps = (p: Prop[]) => write(CUSTOM, p);
