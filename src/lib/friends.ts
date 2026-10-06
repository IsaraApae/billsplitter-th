// Saved friends & groups (stored on the device). Pure helpers.

import type { Person, PersonColor } from "./types";
import { PERSON_COLORS } from "./types";

export interface Friend {
  id: string;
  name: string;
  emoji?: string;
  color?: PersonColor;
  lastUsed: number; // epoch ms, 0 = never
}

export interface FriendGroup {
  id: string;
  name: string;
  memberIds: string[];
}

/** The device owner. Always id "me" inside a split. */
export const ME_ID = "me";

const norm = (s: string) => s.normalize("NFC").trim().toLocaleLowerCase();

export function findByName(friends: Friend[], name: string): Friend | undefined {
  const n = norm(name);
  return friends.find((f) => norm(f.name) === n);
}

/** Most recently used first, then alphabetical; optional search filter. */
export function sortFriends(friends: Friend[], query = ""): Friend[] {
  const q = norm(query);
  return friends
    .filter((f) => !q || norm(f.name).includes(q))
    .sort((a, b) => b.lastUsed - a.lastUsed || a.name.localeCompare(b.name));
}

/** Adds a friend unless one with the same name exists (case-insensitive). */
export function addFriend(
  friends: Friend[],
  input: { name: string; emoji?: string; color?: PersonColor },
  id: string,
): { friends: Friend[]; friend: Friend; created: boolean } {
  const existing = findByName(friends, input.name);
  if (existing) return { friends, friend: existing, created: false };
  const friend: Friend = {
    id,
    name: input.name.trim().slice(0, 40),
    emoji: input.emoji || undefined,
    color: input.color ?? PERSON_COLORS[friends.length % PERSON_COLORS.length],
    lastUsed: 0,
  };
  return { friends: [...friends, friend], friend, created: true };
}

export function markUsed(friends: Friend[], ids: string[], now: number): Friend[] {
  const set = new Set(ids);
  return friends.map((f) => (set.has(f.id) ? { ...f, lastUsed: now } : f));
}

/**
 * Each person's newest bill date (epoch ms) across the given splits, so a
 * friend's "Last split" follows the bills' dates, not when they were saved.
 */
export function lastSplitDates(splits: { createdAt: string; personIds?: string[] }[]): Map<string, number> {
  const last = new Map<string, number>();
  for (const s of splits) {
    const t = Date.parse(s.createdAt);
    if (!Number.isFinite(t)) continue;
    for (const id of s.personIds ?? []) if (t > (last.get(id) ?? 0)) last.set(id, t);
  }
  return last;
}

/** Friends with `lastUsed` set to their newest bill date, where one is known. */
export function withLastSplit(friends: Friend[], last: Map<string, number>): Friend[] {
  return friends.map((f) => ({ ...f, lastUsed: last.get(f.id) ?? f.lastUsed }));
}

/** Friend ids from the last split that still exist. */
export function sameAsLastTime(friends: Friend[], lastIds: string[]): string[] {
  const exists = new Set(friends.map((f) => f.id));
  return lastIds.filter((id) => exists.has(id));
}

/** Turns picked friends into split people, with "Me" first. */
export function toPeople(me: { name: string; emoji?: string; color?: PersonColor }, picked: Friend[]): Person[] {
  return [
    { id: ME_ID, name: me.name.trim() || "Me", emoji: me.emoji, color: me.color ?? "emerald" },
    ...picked.map((f) => ({ id: f.id, name: f.name, emoji: f.emoji, color: f.color })),
  ];
}

/** Lists of people: the organiser ("me") first, then everyone by name (Thai and English). */
export function organiserFirstByName<T>(items: T[], idOf: (t: T) => string, nameOf: (t: T) => string): T[] {
  return [...items].sort((a, b) => {
    const am = idOf(a) === ME_ID;
    const bm = idOf(b) === ME_ID;
    if (am !== bm) return am ? -1 : 1;
    return nameOf(a).localeCompare(nameOf(b), ["th", "en"], { sensitivity: "base" });
  });
}
