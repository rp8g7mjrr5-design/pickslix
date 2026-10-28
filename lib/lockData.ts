// Daily Lock storage (server only): the day's menu, each player's locks, grading and the streak leaderboard.
// Each menu line is graded once from the box score and every lock on it reads that result.
import type { Account } from "./accounts.ts";
import { kvDel, kvGet, kvKeys, kvSet } from "./db.ts";
import { espnDate } from "./espn.ts";
import { gradeLeg } from "./grade.ts";
import { buildMenu, canPick, lockRecord, type LockEntry, type LockMenu, type LockOption, type LockRecord } from "./lock.ts";
import { getProvider } from "./providers.ts";
import { todaysSlate } from "./slateData.ts";

/** Whose locks: an account, or a signed-out browser's sync code. Same shape as alert owners. */
export type LockOwner = { user: string } | { code: string };

type GradedOption = LockOption & { result?: "hit" | "miss" | "push" };
type StoredMenu = Omit<LockMenu, "options"> & { options: GradedOption[] };

const ownerId = (o: LockOwner) => ("user" in o ? `user:${o.user}` : `code:${o.code}`);
const menuKey = (date: string) => `lock:menu:${date}`;
const entriesKey = (o: LockOwner) => `lock:${ownerId(o)}`;
const KEEP_S = 400 * 86400;
const RETRY_S = 15 * 60;
const BOARD = "lock:board";
const BOARD_TTL = 5 * 60;

const flip = (r: "hit" | "miss" | "push", side: "OVER" | "UNDER") => (side === "OVER" || r === "push" ? r : r === "hit" ? "miss" : "hit");

const sampleMenus = new Map<string, StoredMenu>();

/** Today's menu, built from the scored slate the first time someone asks once lines are up. */
export async function todaysMenu(now = Date.now()): Promise<StoredMenu | null> {
  const date = espnDate(new Date(now));
  if (getProvider().name === "sample") {
    if (!sampleMenus.has(date)) {
      const menu = buildMenu((await todaysSlate(now)).rows, date, now);
      if (menu) sampleMenus.set(date, menu);
    }
    return sampleMenus.get(date) ?? null;
  }
  const saved = await kvGet<StoredMenu>(menuKey(date)).catch(() => null);
  if (saved) return saved;
  if (await kvGet(`lock:try:${date}`).catch(() => null)) return null;
  await kvSet(`lock:try:${date}`, 1, RETRY_S).catch(() => {});
  const menu = buildMenu((await todaysSlate(now)).rows, date, now);
  if (menu) await kvSet(menuKey(date), menu, KEEP_S).catch(() => {});
  return menu;
}

/** Grade a past menu's lines whose games are over (once each), and return it. */
async function gradedMenu(date: string, now: number): Promise<StoredMenu | null> {
  const menu = getProvider().name === "sample" ? (sampleMenus.get(date) ?? null) : await kvGet<StoredMenu>(menuKey(date)).catch(() => null);
  if (!menu) return null;
  const due = menu.options.filter((o) => !o.result && now > Date.parse(o.gameTime) + 3 * 3600_000);
  if (!due.length) return menu;
  const results = await Promise.all(due.map((o) => gradeLeg({ ...o, side: "OVER", savedAt: o.gameTime }).catch(() => null)));
  let changed = false;
  due.forEach((o, i) => {
    if (results[i]) {
      o.result = results[i]!;
      changed = true;
    }
  });
  if (changed && getProvider().name !== "sample") await kvSet(menuKey(date), menu, KEEP_S).catch(() => {});
  return menu;
}

/** This owner's locks, newest first, with any finished games graded. */
export async function loadEntries(o: LockOwner, now = Date.now()): Promise<LockEntry[]> {
  const entries = (await kvGet<LockEntry[]>(entriesKey(o)).catch(() => null)) ?? [];
  const open = entries.filter((e) => !e.result && now > Date.parse(e.option.gameTime) + 3 * 3600_000);
  if (!open.length) return entries;
  let changed = false;
  for (const date of new Set(open.map((e) => e.date))) {
    const menu = await gradedMenu(date, now);
    for (const e of open.filter((x) => x.date === date)) {
      const r = menu?.options.find((x) => x.id === e.option.id)?.result;
      if (r) {
        e.result = flip(r, e.side);
        changed = true;
      }
    }
  }
  if (changed) await kvSet(entriesKey(o), entries, KEEP_S).catch(() => {});
  return entries;
}

/** Lock in (or change) today's pick. */
export async function lockIn(o: LockOwner, optionId: string, side: "OVER" | "UNDER", now = Date.now()): Promise<LockEntry | { error: string }> {
  const menu = await todaysMenu(now);
  const option = menu?.options.find((x) => x.id === optionId);
  if (!menu || !option) return { error: "That pick isn't on today's menu." };
  const entries = (await kvGet<LockEntry[]>(entriesKey(o)).catch(() => null)) ?? [];
  const current = entries.find((e) => e.date === menu.date);
  const problem = canPick(option, current, now);
  if (problem) return { error: problem };
  const { result: _, ...clean } = option as GradedOption;
  const entry: LockEntry = { date: menu.date, option: clean, side, at: new Date(now).toISOString() };
  await kvSet(entriesKey(o), [entry, ...entries.filter((e) => e.date !== menu.date)].slice(0, 400), KEEP_S);
  await kvDel(BOARD).catch(() => {});
  return entry;
}

export interface LockLeader extends LockRecord {
  username: string;
}

/** Everyone with a username, ranked by current streak, then best streak, then hits. */
export async function lockLeaders(): Promise<{ rows: LockLeader[]; at: string }> {
  const cached = await kvGet<{ rows: LockLeader[]; at: string }>(BOARD).catch(() => null);
  if (cached) return cached;
  const keys = await kvKeys("lock:user:").catch(() => [] as string[]);
  const rows: LockLeader[] = [];
  const now = Date.now();
  await Promise.all(
    keys.map(async (k) => {
      const user = k.slice("lock:user:".length);
      const account = await kvGet<Account>(`account:${user}`).catch(() => null);
      if (!account?.username || account.banned || account.hidden) return;
      const record = lockRecord(await loadEntries({ user }, now));
      if (record.hits + record.misses) rows.push({ username: account.username, ...record });
    }),
  );
  rows.sort((a, b) => b.streak - a.streak || b.best - a.best || b.hits - a.hits || a.username.localeCompare(b.username));
  const body = { rows: rows.slice(0, 50), at: new Date(now).toISOString() };
  await kvSet(BOARD, body, BOARD_TTL).catch(() => {});
  return body;
}

/** For the cron: make sure today's menu exists and yesterday's lines get graded. */
export async function tendLock(now = Date.now()) {
  const menu = await todaysMenu(now).catch(() => null);
  await gradedMenu(espnDate(new Date(now - 86400_000)), now).catch(() => null);
  return menu ? menu.options.length : 0;
}
