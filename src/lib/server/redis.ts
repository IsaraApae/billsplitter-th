import "server-only";
import { Redis } from "@upstash/redis";
import { createClient, type RedisClientType } from "redis";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eventPeople, spreadPayment, type EventBill, type EventMeta } from "../event";
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
  hgetall(key: string): Promise<Record<string, string>>;
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
    // Upstash decodes numeric strings, so normalise the values back to strings.
    hgetall: async (k) =>
      Object.fromEntries(Object.entries((await r.hgetall<Record<string, unknown>>(k)) ?? {}).map(([f, v]) => [f, String(v)])),
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
    hgetall: async (k) => ({ ...(await (await tcp()).hGetAll(k)) }),
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
    hgetall: async (k) => Object.fromEntries(hash(k)),
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
/** People who paid part of their amount: personId → amount paid so far (minor units). */
const partKey = (id: string) => `split:${id}:part`;

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
    if (await db().set(docKey(id), stored, { ex: TTL_SECONDS, nx: true })) {
      await linkPhoto(id, doc);
      return { id, token };
    }
  }
  throw new Error("Could not allocate an id");
}

export async function getSplit(id: string): Promise<{ doc: SplitDoc; updatedAt: string } | null> {
  const s = await db().get<StoredSplit>(docKey(id));
  if (!s) return null;
  // Also covers photos on splits saved before photos were linked.
  if (s.doc.photo) await linkPhoto(id, s.doc).catch(() => {});
  return { doc: s.doc, updatedAt: s.updatedAt };
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
    db().hdel(partKey(id), ...removed),
    db().expire(paidKey(id), TTL_SECONDS),
    db().expire(partKey(id), TTL_SECONDS),
    linkPhoto(id, next.doc),
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

/** Part-payments so far: personId → amount paid (minor units). */
export async function getPartial(id: string): Promise<Record<string, number>> {
  const raw = await db().hgetall(partKey(id));
  return Object.fromEntries(
    Object.entries(raw)
      .map(([pid, v]) => [pid, Math.round(Number(v))] as const)
      .filter(([, n]) => Number.isFinite(n) && n > 0),
  );
}

/** Paid in full (the big tick), part of it (the small tick), or not yet. */
export type Payment = { kind: "full" } | { kind: "part"; amount: number } | { kind: "none" };

export interface PaidState {
  paid: string[];
  partial: Record<string, number>;
}

/** Current payments of a split's people (ignoring people no longer in it). */
export async function getPaidState(id: string, doc: SplitDoc): Promise<PaidState> {
  const ids = new Set(doc.people.map((p) => p.id));
  const [paid, partial] = await Promise.all([getPaid(id), getPartial(id)]);
  return {
    paid: paid.filter((p) => ids.has(p)),
    partial: Object.fromEntries(Object.entries(partial).filter(([p]) => ids.has(p) && !paid.includes(p))),
  };
}

/** Writes one person's payment; no token check (callers check ownership). */
async function writePayment(id: string, doc: SplitDoc, personId: string, payment: Payment): Promise<void> {
  if (payment.kind === "full") {
    await Promise.all([db().hset(paidKey(id), personId, String(Date.now())), db().hdel(partKey(id), personId)]);
  } else if (payment.kind === "part") {
    await Promise.all([db().hdel(paidKey(id), personId), db().hset(partKey(id), personId, String(payment.amount))]);
  } else {
    await Promise.all([db().hdel(paidKey(id), personId), db().hdel(partKey(id), personId)]);
  }
  await Promise.all([
    db().expire(paidKey(id), TTL_SECONDS),
    db().expire(partKey(id), TTL_SECONDS),
    db().expire(docKey(id), TTL_SECONDS),
    linkPhoto(id, doc),
  ]);
}

/** Only the creator (edit token) can record who has paid, and how much. */
export async function setPayment(
  id: string,
  personId: string,
  payment: Payment,
  token: string | null,
): Promise<PaidState | "not_found" | "forbidden"> {
  const s = await db().get<StoredSplit>(docKey(id));
  if (!s || !s.doc.people.some((p) => p.id === personId)) return "not_found";
  if (!(token && tokenMatches(token, s.editHash))) return "forbidden";
  await writePayment(id, s.doc, personId, payment);
  return getPaidState(id, s.doc);
}

// ---- Slips: friends' transfer slips that ticked them as paid ----------------

const slipsKey = (id: string) => `split:${id}:slips`;
const slipRefKey = (ref: string) => `slipref:${ref}`;
const SLIP_REF_TTL = 60 * 60 * 24 * 400;

export interface SlipRecord {
  /** stored picture (see /api/receipt) */
  photo: string;
  /** minor units */
  amount: number;
  date: string;
  reference: string;
  /** whether the receiver could be matched to the organiser */
  receiver: "match" | "unknown";
  senderName: string | null;
  at: string;
}

/**
 * Claims a slip's reference so the same transfer can't tick anyone twice.
 * Returns false if it was already used.
 */
export async function claimSlipReference(reference: string, owner: string): Promise<boolean> {
  return db().set(slipRefKey(reference), owner, { ex: SLIP_REF_TTL, nx: true });
}

export async function addSlip(id: string, personId: string, slip: SlipRecord): Promise<void> {
  const all = await getSlips(id);
  const mine = [...(all[personId] ?? []), slip].slice(-10);
  await db().hset(slipsKey(id), personId, JSON.stringify(mine));
  await db().expire(slipsKey(id), TTL_SECONDS);
}

/** Slips per person (organiser-only data: they show bank names). */
export async function getSlips(id: string): Promise<Record<string, SlipRecord[]>> {
  const raw = await db().hgetall(slipsKey(id));
  const out: Record<string, SlipRecord[]> = {};
  for (const [pid, v] of Object.entries(raw)) {
    try {
      const list = JSON.parse(v);
      if (Array.isArray(list)) out[pid] = list as SlipRecord[];
    } catch {
      /* ignore a bad record */
    }
  }
  return out;
}

/** True if `token` is this split's edit token. */
export async function canEditSplit(id: string, token: string | null): Promise<boolean> {
  const s = await db().get<StoredSplit>(docKey(id));
  return !!(s && token && tokenMatches(token, s.editHash));
}

/** Records a payment without an edit token — only after a slip has been checked. */
export async function recordCheckedPayment(id: string, personId: string, payment: Payment): Promise<PaidState | "not_found"> {
  const s = await db().get<StoredSplit>(docKey(id));
  if (!s || !s.doc.people.some((p) => p.id === personId)) return "not_found";
  await writePayment(id, s.doc, personId, payment);
  return getPaidState(id, s.doc);
}

/** Records a big-bill payment without the event token — only after a slip has been checked. */
export async function recordCheckedEventPayment(id: string, personKey: string, payment: Payment): Promise<LoadedEvent | "not_found"> {
  const loaded = await getEvent(id);
  const person = loaded && eventPeople(loaded.bills).find((p) => p.key === personKey);
  if (!loaded || !person) return "not_found";
  for (const bp of spreadPayment(person, payment)) {
    const bill = loaded.bills.find((b) => b.id === bp.splitId)!;
    await writePayment(bp.splitId, bill.doc, bp.personId, bp);
  }
  return (await getEvent(id)) ?? "not_found";
}

/** True if `token` is this big bill's edit token. */
export async function canEditEvent(id: string, token: string | null): Promise<boolean> {
  const e = await db().get<StoredEvent>(eventKey(id));
  return !!(e && token && tokenMatches(token, e.editHash));
}

// ---- Big bills: several splits from one outing, shown and paid as one -------

const eventKey = (id: string) => `event:${id}`;

interface StoredEvent extends EventMeta {
  editHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoadedEvent {
  meta: EventMeta & { updatedAt: string };
  bills: EventBill[];
}

/** Every split must exist and the caller must hold its edit token. */
async function ownsSplits(splits: { id: string; token?: string }[], known: string[] = []): Promise<boolean> {
  for (const sp of splits) {
    if (known.includes(sp.id)) continue;
    const s = await db().get<StoredSplit>(docKey(sp.id));
    if (!s || !sp.token || !tokenMatches(sp.token, s.editHash)) return false;
  }
  return true;
}

export async function createEvent(
  meta: Omit<EventMeta, "splitIds">,
  splits: { id: string; token: string }[],
): Promise<{ id: string; token: string } | "forbidden"> {
  if (!(await ownsSplits(splits))) return "forbidden";
  const token = newToken();
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newId();
    const stored: StoredEvent = { ...meta, splitIds: splits.map((x) => x.id), editHash: hash(token), createdAt: now, updatedAt: now };
    if (await db().set(eventKey(id), stored, { ex: TTL_SECONDS, nx: true })) return { id, token };
  }
  throw new Error("Could not allocate an id");
}

/** Rename, re-date, or add/remove bills. New bills need their own edit tokens. */
export async function updateEvent(
  id: string,
  token: string,
  meta: Omit<EventMeta, "splitIds">,
  splits: { id: string; token?: string }[],
): Promise<"ok" | "not_found" | "forbidden"> {
  const e = await db().get<StoredEvent>(eventKey(id));
  if (!e) return "not_found";
  if (!tokenMatches(token, e.editHash)) return "forbidden";
  if (!(await ownsSplits(splits, e.splitIds))) return "forbidden";
  const next: StoredEvent = { ...e, ...meta, splitIds: splits.map((x) => x.id), updatedAt: new Date().toISOString() };
  await db().set(eventKey(id), next, { ex: TTL_SECONDS });
  return "ok";
}

/** The event with its bills (expired bills are left out). Viewing keeps it alive. */
export async function getEvent(id: string): Promise<LoadedEvent | null> {
  const e = await db().get<StoredEvent>(eventKey(id));
  if (!e) return null;
  await db().expire(eventKey(id), TTL_SECONDS);
  const bills = await Promise.all(
    e.splitIds.map(async (sid): Promise<EventBill | null> => {
      const s = await getSplit(sid);
      if (!s) return null;
      const state = await getPaidState(sid, s.doc);
      return { id: sid, doc: s.doc, ...state };
    }),
  );
  return {
    meta: { title: e.title, date: e.date, splitIds: e.splitIds, updatedAt: e.updatedAt },
    bills: bills.filter((b): b is EventBill => b !== null),
  };
}

/** Records one person's payment for the whole event, spread over their bills. */
export async function setEventPayment(
  id: string,
  token: string | null,
  personKey: string,
  payment: Payment,
): Promise<LoadedEvent | "not_found" | "forbidden"> {
  const e = await db().get<StoredEvent>(eventKey(id));
  if (!e) return "not_found";
  if (!(token && tokenMatches(token, e.editHash))) return "forbidden";
  const loaded = await getEvent(id);
  const person = loaded && eventPeople(loaded.bills).find((p) => p.key === personKey);
  if (!loaded || !person) return "not_found";
  for (const bp of spreadPayment(person, payment)) {
    const bill = loaded.bills.find((b) => b.id === bp.splitId)!;
    await writePayment(bp.splitId, bill.doc, bp.personId, bp);
  }
  return (await getEvent(id)) ?? "not_found";
}

// ---- Receipt photos: which split shows each one, so unused photos can be deleted

const photoKey = (url: string) => `photo:${url}`;
const PHOTO_TTL = TTL_SECONDS + 60 * 60 * 24 * 30; // outlives the split; refreshed with it

async function linkPhoto(splitId: string, doc: SplitDoc): Promise<void> {
  if (doc.photo) await db().set(photoKey(doc.photo), splitId, { ex: PHOTO_TTL });
}

/** True while a live split still shows this receipt photo. */
export async function photoInUse(url: string): Promise<boolean> {
  const splitId = await db().get<string>(photoKey(url));
  if (!splitId) return false;
  const s = await db().get<StoredSplit>(docKey(splitId));
  return s?.doc.photo === url;
}

export async function forgetPhoto(url: string): Promise<void> {
  await db().del(photoKey(url));
}

// ---- Gemini model cooldowns (circuit breaker shared by all instances) -----

const coolKey = (model: string) => `gemcool:${model}`;
const memoryCool = new Map<string, number>(); // fallback when storage isn't configured

/** Models currently cooling down (skip-first), with seconds left. */
export async function getModelCooldowns(models: string[]): Promise<Set<string>> {
  const cooling = new Set<string>();
  const now = Date.now();
  for (const m of models) if ((memoryCool.get(m) ?? 0) > now) cooling.add(m);
  if (!kv) return cooling;
  try {
    const flags = await Promise.all(models.map((m) => kv.get<number>(coolKey(m))));
    flags.forEach((until, i) => until && until > now && cooling.add(models[i]));
  } catch {
    /* storage hiccup: fall back to what this instance knows */
  }
  return cooling;
}

export async function setModelCooldown(model: string, seconds: number): Promise<void> {
  const s = Math.max(10, Math.min(Math.round(seconds), 6 * 60 * 60));
  const until = Date.now() + s * 1000;
  memoryCool.set(model, until);
  if (!kv) return;
  try {
    await kv.set(coolKey(model), until, { ex: s });
  } catch {
    /* best effort */
  }
}
