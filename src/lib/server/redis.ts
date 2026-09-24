import "server-only";
import { Redis } from "@upstash/redis";
import { createClient, type RedisClientType } from "redis";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SplitDoc } from "../types";

// Two supported backends:
// - Upstash (REST): KV_REST_API_* from the Marketplace integration, or UPSTASH_REDIS_REST_*.
// - Any Redis over TCP (e.g. Redis Cloud from the Marketplace): REDIS_URL.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const tcpUrl = process.env.REDIS_URL;

/** Upstash REST client (also used by the Upstash rate limiter), or null. */
export const redis: Redis | null = url && token ? new Redis({ url, token, enableAutoPipelining: true }) : null;

export const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days, refreshed on every write

/** The few storage operations the app needs. */
interface Kv {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts: { ex: number; nx?: boolean }): Promise<boolean>;
  hkeys(key: string): Promise<string[]>;
  hset(key: string, field: string, value: string): Promise<void>;
  hdel(key: string, ...fields: string[]): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

function upstashKv(r: Redis): Kv {
  return {
    get: (k) => r.get(k),
    set: async (k, v, o) => (o.nx ? r.set(k, v, { ex: o.ex, nx: true }) : r.set(k, v, { ex: o.ex })) !== null,
    hkeys: (k) => r.hkeys(k),
    hset: async (k, f, v) => void (await r.hset(k, { [f]: v })),
    hdel: async (k, ...f) => void (f.length && (await r.hdel(k, ...f))),
    expire: async (k, s) => void (await r.expire(k, s)),
    del: async (k) => void (await r.del(k)),
  };
}

type TcpClient = RedisClientType;
let tcpClient: Promise<TcpClient> | null = null;

/** One connection per warm serverless instance, reconnecting after failures. */
function tcp(): Promise<TcpClient> {
  if (!tcpClient) {
    const client: TcpClient = createClient({ url: tcpUrl, socket: { connectTimeout: 5000, reconnectStrategy: (n) => Math.min(n * 200, 2000) } });
    client.on("error", (e) => console.error("Redis error", e?.message ?? e));
    tcpClient = client.connect().then(() => client).catch((e) => {
      tcpClient = null;
      throw e;
    });
  }
  return tcpClient;
}

function tcpKv(): Kv {
  return {
    get: async <T,>(k: string) => {
      const v = await (await tcp()).get(k);
      return v === null ? null : (JSON.parse(v) as T);
    },
    set: async (k, v, o) =>
      (await (await tcp()).set(k, JSON.stringify(v), {
        expiration: { type: "EX", value: o.ex },
        ...(o.nx ? { condition: "NX" as const } : {}),
      })) !== null,
    hkeys: async (k) => (await tcp()).hKeys(k),
    hset: async (k, f, v) => void (await (await tcp()).hSet(k, f, v)),
    hdel: async (k, ...f) => void (f.length && (await (await tcp()).hDel(k, f))),
    expire: async (k, s) => void (await (await tcp()).expire(k, s)),
    del: async (k) => void (await (await tcp()).del(k)),
  };
}

/**
 * Fixed-window counter for rate limiting on a TCP Redis (Upstash uses its own
 * limiter). Returns the hit count in the current window, or null if unavailable.
 */
export async function countHit(key: string, windowSec: number): Promise<number | null> {
  if (!tcpUrl || redis) return null;
  const c = await tcp();
  const k = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const [n] = await c.multi().incr(k).expire(k, windowSec + 1).exec();
  return Number(n);
}

/** Dev-only in-memory store so the whole flow works locally without Redis. */
function memoryKv(): Kv {
  const g = globalThis as unknown as { __bsMem?: Map<string, unknown> };
  const m = (g.__bsMem ??= new Map<string, unknown>());
  const hash = (k: string) => {
    let h = m.get(k) as Map<string, string> | undefined;
    if (!h) m.set(k, (h = new Map()));
    return h;
  };
  return {
    get: async <T,>(k: string) => (m.has(k) ? (structuredClone(m.get(k)) as T) : null),
    set: async (k, v, o) => {
      if (o.nx && m.has(k)) return false;
      m.set(k, structuredClone(v));
      return true;
    },
    hkeys: async (k) => [...hash(k).keys()],
    hset: async (k, f, v) => void hash(k).set(f, v),
    hdel: async (k, ...f) => f.forEach((x) => hash(k).delete(x)),
    expire: async () => {},
    del: async (k) => void m.delete(k),
  };
}

const kv: Kv | null = redis
  ? upstashKv(redis)
  : tcpUrl
    ? tcpKv()
    : process.env.NODE_ENV !== "production"
      ? memoryKv()
      : null;

export const storageReady = kv !== null;

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Storage is not configured (set REDIS_URL, or KV_REST_API_URL + KV_REST_API_TOKEN).");
  }
}

function db(): Kv {
  if (!kv) throw new StorageNotConfiguredError();
  return kv;
}

const docKey = (id: string) => `split:${id}`;
const paidKey = (id: string) => `split:${id}:paid`;

interface StoredSplit {
  doc: SplitDoc;
  editHash: string;
  updatedAt: string;
}

export const newId = () => randomBytes(12).toString("base64url"); // 96 bits, 16 chars
export const newToken = () => randomBytes(32).toString("base64url");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export function isValidId(id: string): boolean {
  return /^[\w-]{16}$/.test(id);
}

export async function createSplit(doc: SplitDoc): Promise<{ id: string; token: string }> {
  const token = newToken();
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newId();
    const stored: StoredSplit = { doc, editHash: hash(token), updatedAt: new Date().toISOString() };
    if (await db().set(docKey(id), stored, { ex: TTL_SECONDS, nx: true })) return { id, token };
  }
  throw new Error("Could not allocate an id");
}

export async function getSplit(id: string): Promise<{ doc: SplitDoc; updatedAt: string } | null> {
  const s = await db().get<StoredSplit>(docKey(id));
  return s ? { doc: s.doc, updatedAt: s.updatedAt } : null;
}

export async function getPaid(id: string): Promise<string[]> {
  return db().hkeys(paidKey(id));
}

export type UpdateResult = "ok" | "not_found" | "forbidden";

function tokenMatches(token: string, editHash: string): boolean {
  const a = Buffer.from(hash(token));
  const b = Buffer.from(editHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function updateSplit(id: string, token: string, doc: SplitDoc): Promise<UpdateResult> {
  const s = await db().get<StoredSplit>(docKey(id));
  if (!s) return "not_found";
  if (!tokenMatches(token, s.editHash)) return "forbidden";
  // Keep the original creation date.
  const next: StoredSplit = {
    doc: { ...doc, createdAt: s.doc.createdAt },
    editHash: s.editHash,
    updatedAt: new Date().toISOString(),
  };
  const removed = s.doc.people.map((p) => p.id).filter((pid) => !doc.people.some((p) => p.id === pid));
  await Promise.all([
    db().set(docKey(id), next, { ex: TTL_SECONDS }),
    db().hdel(paidKey(id), ...removed),
    db().expire(paidKey(id), TTL_SECONDS),
  ]);
  return "ok";
}

// ---- Owner profile (the creator's device) — holds the uploaded PromptPay QR --

const ownerKey = (id: string) => `owner:${id}`;
const OWNER_TTL = 60 * 60 * 24 * 400; // refreshed whenever the owner shares a split

export interface OwnerRecord {
  editHash: string;
  qrUrl: string | null; // Vercel Blob URL (or "dev:<key>" locally)
  version: number; // bumps on every change, used to bust image caches
}

export const isValidOwnerId = isValidId;

export async function getOwner(id: string): Promise<OwnerRecord | null> {
  return isValidOwnerId(id) ? db().get<OwnerRecord>(ownerKey(id)) : null;
}

/** Returns the record if `token` owns it, "forbidden" if not, null if it doesn't exist. */
export async function getOwnerForWrite(id: string, token: string): Promise<OwnerRecord | "forbidden" | null> {
  const o = await getOwner(id);
  if (!o) return null;
  const a = Buffer.from(hash(token));
  const b = Buffer.from(o.editHash);
  return a.length === b.length && timingSafeEqual(a, b) ? o : "forbidden";
}

export async function createOwner(): Promise<{ id: string; token: string }> {
  const token = newToken();
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newId();
    const rec: OwnerRecord = { editHash: hash(token), qrUrl: null, version: 0 };
    if (await db().set(ownerKey(id), rec, { ex: OWNER_TTL, nx: true })) return { id, token };
  }
  throw new Error("Could not allocate an owner id");
}

export async function saveOwner(id: string, rec: OwnerRecord): Promise<void> {
  await db().set(ownerKey(id), rec, { ex: OWNER_TTL });
}

export async function touchOwner(id: string): Promise<void> {
  if (isValidOwnerId(id)) await db().expire(ownerKey(id), OWNER_TTL);
}

// Dev-only image storage when Vercel Blob isn't configured.
export async function devImagePut(key: string, dataUrl: string) {
  await db().set(`devimg:${key}`, dataUrl, { ex: OWNER_TTL });
}
export async function devImageGet(key: string) {
  return db().get<string>(`devimg:${key}`);
}
export async function devImageDel(key: string) {
  await db().del(`devimg:${key}`);
}

/**
 * Anyone with the link can tick "Paid"; only the creator (edit token) can
 * untick it, so nobody else can mark a payment as undone.
 */
export async function setPaid(
  id: string,
  personId: string,
  paid: boolean,
  token: string | null,
): Promise<string[] | "not_found" | "forbidden"> {
  const s = await db().get<StoredSplit>(docKey(id));
  if (!s || !s.doc.people.some((p) => p.id === personId)) return "not_found";
  if (!paid && !(token && tokenMatches(token, s.editHash))) return "forbidden";
  await (paid ? db().hset(paidKey(id), personId, String(Date.now())) : db().hdel(paidKey(id), personId));
  await Promise.all([db().expire(paidKey(id), TTL_SECONDS), db().expire(docKey(id), TTL_SECONDS)]);
  const ids = new Set(s.doc.people.map((p) => p.id));
  return (await getPaid(id)).filter((p) => ids.has(p));
}
