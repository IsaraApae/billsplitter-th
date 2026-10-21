"use client";

// localStorage helpers. Every access is guarded: storage can be unavailable
// (private mode, blocked site data) and the app must still work.

import { calculate } from "../calc";
import { billDate } from "../draft";
import { organiserLines, settlesDirectly } from "../settle";
import type { Person, SplitDoc } from "../types";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or disabled — ignore */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ---- Edit tokens (kept separately so deleting history doesn't lose edit rights)
const TOKENS = "bs:tokens";

export function getEditToken(id: string): string | null {
  return load<Record<string, string>>(TOKENS, {})[id] ?? null;
}

export function setEditToken(id: string, token: string): void {
  save(TOKENS, { ...load<Record<string, string>>(TOKENS, {}), [id]: token });
}

// ---- History
export interface HistoryEntry {
  id: string;
  title: string;
  createdAt: string;
  total: number;
  currency: string;
  people: number;
  paid: number;
  /** ids of everyone in the split (absent on entries saved before this was kept) */
  personIds?: string[];
  /**
   * who's in the split, for the History list (absent on older entries), with
   * what each is asked to pay (`amount`, minor units; negative = owed back)
   */
  members?: (Pick<Person, "id" | "name" | "emoji" | "color"> & { amount?: number })[];
  /** ids of the people marked paid */
  paidIds?: string[];
  /** part-payments so far: personId → amount paid (minor units) */
  partialPaid?: Record<string, number>;
  /** friends pay each payer directly: progress counts transfers, so refresh from the whole split */
  direct?: boolean;
}

/**
 * Paid progress counts only the friends: the organiser ("me") paid the bill
 * and never owes themselves. Older splits without an organiser count everyone.
 */
export function paidProgress(personIds: string[], paidIds: string[]): { people: number; paid: number } {
  const friends = personIds.filter((id) => id !== "me");
  return { people: friends.length, paid: paidIds.filter((id) => friends.includes(id)).length };
}

/** What History keeps from a saved split besides its title and totals. */
export function historyFromDoc(doc: SplitDoc): Pick<HistoryEntry, "createdAt" | "total" | "personIds" | "members" | "direct"> {
  const calc = calculate(doc);
  // A friend's amount is their money with the organiser (when friends pay
  // each payer directly, only what goes to or from the organiser).
  const amounts = new Map(calc.people.map((p) => [p.personId, p.payable]));
  for (const l of organiserLines(doc, { paid: [], partial: {} }, calc)) amounts.set(l.personId, l.amount);
  return {
    createdAt: billDate(doc).toISOString(),
    total: calc.total,
    personIds: doc.people.map((p) => p.id),
    members: doc.people.map(({ id, name, emoji, color }) => ({ id, name, emoji, color, amount: amounts.get(id) ?? 0 })),
    direct: settlesDirectly(doc) || undefined,
  };
}

const HISTORY = "bs:history";

export function getHistory(): HistoryEntry[] {
  const h = load<HistoryEntry[]>(HISTORY, []);
  return Array.isArray(h) ? h : [];
}

/** Newest bill date first (`createdAt` holds the bill's date); ties keep their order. */
export function byBillDate(entries: HistoryEntry[]): HistoryEntry[] {
  const time = (h: HistoryEntry) => Date.parse(h.createdAt) || 0;
  return [...entries].sort((a, b) => time(b) - time(a));
}

export function upsertHistory(entry: HistoryEntry): void {
  const rest = getHistory().filter((h) => h.id !== entry.id);
  save(HISTORY, [entry, ...rest].slice(0, 100));
}

/** Fired when History entries change, so summaries (like "Owed to you") can update. */
export const HISTORY_EVENT = "bs-history";

export function patchHistory(id: string, patch: Partial<HistoryEntry>): void {
  save(HISTORY, getHistory().map((h) => (h.id === id ? { ...h, ...patch } : h)));
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

export function deleteHistory(id: string): void {
  save(HISTORY, getHistory().filter((h) => h.id !== id));
}

// ---- Big bills (several splits from one outing). Edit tokens live in TOKENS too.
export interface EventEntry {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  splitIds: string[];
}

const EVENTS = "bs:events";

export function getEvents(): EventEntry[] {
  const e = load<EventEntry[]>(EVENTS, []);
  return Array.isArray(e) ? e : [];
}

export function upsertEvent(entry: EventEntry): void {
  save(EVENTS, [entry, ...getEvents().filter((e) => e.id !== entry.id)]);
}

export function deleteEvent(id: string): void {
  save(EVENTS, getEvents().filter((e) => e.id !== id));
}

// ---- Bills opened as a friend, for "What I owe"
export interface SeenBill {
  id: string;
  kind: "split" | "event";
  /** epoch ms, last opened */
  at: number;
}

const SEEN = "bs:seen";
/** billId → who I am in it (person id), once picked there */
const PICKS = "bs:picks";
/** the name I go by in friends' bills */
const IAM = "bs:iam";

export function getSeen(): SeenBill[] {
  const s = load<SeenBill[]>(SEEN, []);
  return Array.isArray(s) ? s : [];
}

/** A bill someone else made was opened here (newest first, up to 100). */
export function rememberSeen(id: string, kind: SeenBill["kind"]): void {
  save(SEEN, [{ id, kind, at: Date.now() }, ...getSeen().filter((s) => s.id !== id)].slice(0, 100));
}

export function getPicks(): Record<string, string> {
  return load<Record<string, string>>(PICKS, {});
}

export function getIam(): string | null {
  const n = load<string | null>(IAM, null);
  return typeof n === "string" && n.trim() ? n : null;
}

export function setIam(name: string | null): void {
  if (name?.trim()) save(IAM, name.trim());
  else remove(IAM);
}

/** I picked myself in a bill (to pay or upload a slip): remember who, and my name. */
export function rememberMe(billId: string, personId: string, name?: string): void {
  save(PICKS, { ...getPicks(), [billId]: personId });
  if (name && !getIam()) setIam(name);
}

// ---- This phone's organiser id (random, public), so friends' "What I owe" finds all your bills
const DEVICE = "bs:device";

export function getDeviceKey(): string {
  const k = load<string | null>(DEVICE, null);
  if (typeof k === "string" && /^[\w-]{16,32}$/.test(k)) return k;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const fresh = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  save(DEVICE, fresh);
  return fresh;
}
