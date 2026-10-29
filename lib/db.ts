// Tiny key-value store over Upstash Redis's REST API (free tier, added from the Vercel Marketplace).
// The Vercel integration sets KV_REST_API_URL / KV_REST_API_TOKEN; a direct Upstash setup uses the UPSTASH_ names.
// Without either, values live in this server process's memory, which is fine for local dev.

const url = () => process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = () => process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const dbEnabled = () => Boolean(url() && token());

const memory = new Map<string, { value: string; expires: number }>();

async function command(args: (string | number)[]): Promise<unknown> {
  const res = await fetch(url()!, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
  if (!res.ok || body.error) throw new Error(`Redis ${args[0]} failed: ${body.error ?? res.status}`);
  return body.result;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  let raw: string | null;
  if (dbEnabled()) {
    raw = (await command(["GET", key])) as string | null;
  } else {
    const hit = memory.get(key);
    raw = hit && hit.expires > Date.now() ? hit.value : null;
  }
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const raw = JSON.stringify(value);
  if (dbEnabled()) {
    await command(ttlSeconds ? ["SET", key, raw, "EX", ttlSeconds] : ["SET", key, raw]);
  } else {
    memory.set(key, { value: raw, expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity });
  }
}

/** Set only if the key doesn't exist yet. True when this call claimed it (used for one-time codes). */
export async function kvClaim(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
  const raw = JSON.stringify(value);
  if (dbEnabled()) return (await command(ttlSeconds ? ["SET", key, raw, "NX", "EX", ttlSeconds] : ["SET", key, raw, "NX"])) === "OK";
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return false;
  memory.set(key, { value: raw, expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity });
  return true;
}

export async function kvDel(key: string): Promise<void> {
  if (dbEnabled()) await command(["DEL", key]);
  else memory.delete(key);
}

/** Every key starting with prefix, up to limit. For the admin page, not hot paths. */
export async function kvKeys(prefix: string, limit = 5000): Promise<string[]> {
  if (!dbEnabled()) return [...memory.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit);
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = (await command(["SCAN", cursor, "MATCH", `${prefix}*`, "COUNT", 500])) as [string, string[]];
    keys.push(...batch);
    cursor = next;
  } while (cursor !== "0" && keys.length < limit);
  return keys.slice(0, limit);
}

const hashes = new Map<string, { fields: Map<string, number>; expires: number }>();

/** Add to a counter field in a hash, keeping the hash for ttlSeconds. */
export async function kvHashIncr(key: string, field: string, by: number, ttlSeconds: number): Promise<void> {
  if (dbEnabled()) {
    await command(["HINCRBY", key, field, by]);
    await command(["EXPIRE", key, ttlSeconds]);
    return;
  }
  const hit = hashes.get(key);
  const h = hit && hit.expires > Date.now() ? hit : { fields: new Map<string, number>(), expires: 0 };
  h.fields.set(field, (h.fields.get(field) ?? 0) + by);
  h.expires = Date.now() + ttlSeconds * 1000;
  hashes.set(key, h);
}

/** Every counter in a hash. */
export async function kvHashAll(key: string): Promise<Record<string, number>> {
  if (dbEnabled()) {
    const flat = ((await command(["HGETALL", key])) as string[] | null) ?? [];
    const out: Record<string, number> = {};
    for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]] = Number(flat[i + 1]) || 0;
    return out;
  }
  const hit = hashes.get(key);
  return hit && hit.expires > Date.now() ? Object.fromEntries(hit.fields) : {};
}
