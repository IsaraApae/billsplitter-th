"use client";

// localStorage helpers. Every access is guarded: storage can be unavailable
// (private mode, blocked site data) and the app must still work.

import { calculate } from "../calc";
import { billDate } from "../draft";
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
export function historyFromDoc(doc: SplitDoc): Pick<HistoryEntry, "createdAt" | "personIds" | "members"> {
  const amounts = new Map(calculate(doc).people.map((p) => [p.personId, p.payable]));
  return {
    createdAt: billDate(doc).toISOString(),
    personIds: doc.people.map((p) => p.id),
    members: doc.people.map(({ id, name, emoji, color }) => ({ id, name, emoji, color, amount: amounts.get(id) ?? 0 })),
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

export function patchHistory(id: string, patch: Partial<HistoryEntry>): void {
  save(HISTORY, getHistory().map((h) => (h.id === id ? { ...h, ...patch } : h)));
}

export function deleteHistory(id: string): void {
  save(HISTORY, getHistory().filter((h) => h.id !== id));
}
