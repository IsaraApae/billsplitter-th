"use client";

// localStorage helpers. Every access is guarded: storage can be unavailable
// (private mode, blocked site data) and the app must still work.

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
}

const HISTORY = "bs:history";

export function getHistory(): HistoryEntry[] {
  const h = load<HistoryEntry[]>(HISTORY, []);
  return Array.isArray(h) ? h : [];
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
