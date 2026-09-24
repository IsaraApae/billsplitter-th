import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { countHit, redis } from "./redis";

type Bucket = "scan" | "write" | "read";

const LIMITS: Record<Bucket, [number, `${number} s` | `${number} m`]> = {
  scan: [10, "1 m"],
  write: [30, "1 m"],
  read: [120, "1 m"],
};

const limiters = new Map<Bucket, Ratelimit>();

// In-memory fallback (per serverless instance) when Redis isn't configured,
// e.g. running locally without env vars.
const memory = new Map<string, number[]>();

function memoryLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (memory.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  memory.set(key, hits);
  if (memory.size > 5000) memory.clear();
  return hits.length <= max;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
}

/** Returns a 429 Response when over the limit, otherwise null. */
export async function rateLimit(req: Request, bucket: Bucket): Promise<Response | null> {
  const [max, window] = LIMITS[bucket];
  const key = `${bucket}:${clientIp(req)}`;
  let allowed: boolean;
  let reset = Date.now() + 60_000;
  if (redis) {
    let rl = limiters.get(bucket);
    if (!rl) {
      rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(max, window), prefix: "rl" });
      limiters.set(bucket, rl);
    }
    try {
      const r = await rl.limit(key);
      allowed = r.success;
      reset = r.reset;
    } catch {
      allowed = true; // never block users because the limiter itself failed
    }
  } else {
    let hits: number | null = null;
    try {
      hits = await countHit(key, 60); // TCP Redis (e.g. Redis Cloud)
    } catch {
      hits = 0; // never block users because the limiter itself failed
    }
    allowed = hits === null ? memoryLimit(key, max, 60_000) : hits <= max;
  }
  if (allowed) return null;
  const retry = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return Response.json(
    { error: "rate_limited", message: "Too many requests — please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(retry) } },
  );
}
