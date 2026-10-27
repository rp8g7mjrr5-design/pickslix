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
