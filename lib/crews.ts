// Crews: private groups joined with an invite link. Members see a crew leaderboard and each other's
// recent slips, and can tail a slip with one tap. Needs accounts and a username.
import { getAccount, type Account } from "./accounts.ts";
import { kvClaim, kvDel, kvGet, kvSet } from "./db.ts";

export interface Crew {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  invite: string;
  members: string[];
}

export const MAX_MEMBERS = 50;
export const MAX_CREWS = 10;

const crewKey = (id: string) => `crew:${id}`;
const inviteKey = (code: string) => `crewinvite:${code}`;
const myCrewsKey = (userId: string) => `crews:user:${userId}`;

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const randomId = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => ALPHABET[b % ALPHABET.length]).join("");

export const getCrew = (id: string) => kvGet<Crew>(crewKey(id));
export const myCrewIds = async (userId: string) => (await kvGet<string[]>(myCrewsKey(userId))) ?? [];

export function crewNameProblem(name: string): string | null {
  if (name.length < 2 || name.length > 30) return "Use 2 to 30 characters.";
  return null;
}

async function newInvite(crewId: string): Promise<string> {
  for (;;) {
    const code = randomId(8);
    if (await kvClaim(inviteKey(code), crewId)) return code;
  }
}

/** Accounts need a username before they show up in a crew. */
async function needsUsername(userId: string): Promise<string | null> {
  return (await getAccount(userId)).username ? null : "Pick a username first.";
}

export async function createCrew(userId: string, rawName: string): Promise<Crew | { error: string }> {
  const name = rawName.trim().replace(/\s+/g, " ");
  const problem = crewNameProblem(name) ?? (await needsUsername(userId));
  if (problem) return { error: problem };
  const mine = await myCrewIds(userId);
  if (mine.length >= MAX_CREWS) return { error: `You can be in up to ${MAX_CREWS} crews.` };
  const id = randomId(10);
  const crew: Crew = { id, name, ownerId: userId, createdAt: new Date().toISOString(), invite: await newInvite(id), members: [userId] };
  await kvSet(crewKey(id), crew);
  await kvSet(myCrewsKey(userId), [id, ...mine]);
  return crew;
}

export async function joinCrew(userId: string, rawInvite: string): Promise<Crew | { error: string }> {
  const code = rawInvite.trim().toLowerCase().replace(/.*\/join\//, "");
  const crewId = await kvGet<string>(inviteKey(code));
  const crew = crewId ? await getCrew(crewId) : null;
  if (!crew || crew.invite !== code) return { error: "That invite link isn't valid anymore." };
  if (crew.members.includes(userId)) return crew;
  const problem = await needsUsername(userId);
  if (problem) return { error: problem };
  if (crew.members.length >= MAX_MEMBERS) return { error: "That crew is full." };
  const mine = await myCrewIds(userId);
  if (mine.length >= MAX_CREWS) return { error: `You can be in up to ${MAX_CREWS} crews.` };
  const next = { ...crew, members: [...crew.members, userId] };
  await kvSet(crewKey(crew.id), next);
  await kvSet(myCrewsKey(userId), [crew.id, ...mine.filter((x) => x !== crew.id)]);
  return next;
}

/** Leave a crew, or (as its owner) remove someone from it. The last member out deletes the crew. */
export async function removeMember(crewId: string, actorId: string, memberId: string): Promise<{ ok: true } | { error: string }> {
  const crew = await getCrew(crewId);
  if (!crew || !crew.members.includes(actorId)) return { error: "Crew not found." };
  if (actorId !== memberId && crew.ownerId !== actorId) return { error: "Only the crew's owner can remove people." };
  const members = crew.members.filter((m) => m !== memberId);
  await kvSet(myCrewsKey(memberId), (await myCrewIds(memberId)).filter((x) => x !== crewId));
  if (!members.length) {
    await kvDel(crewKey(crewId));
    await kvDel(inviteKey(crew.invite));
    return { ok: true };
  }
  // The longest-standing member takes over when the owner leaves.
  await kvSet(crewKey(crewId), { ...crew, members, ownerId: crew.ownerId === memberId ? members[0] : crew.ownerId });
  return { ok: true };
}

/** A fresh invite link, so the old one stops working. Owner only. */
export async function resetInvite(crewId: string, actorId: string): Promise<{ invite: string } | { error: string }> {
  const crew = await getCrew(crewId);
  if (!crew || crew.ownerId !== actorId) return { error: "Only the crew's owner can do that." };
  const invite = await newInvite(crewId);
  await kvDel(inviteKey(crew.invite));
  await kvSet(crewKey(crewId), { ...crew, invite });
  return { invite };
}

export const accountOf = (userId: string) => kvGet<Account>(`account:${userId}`).then((a) => a ?? {});
