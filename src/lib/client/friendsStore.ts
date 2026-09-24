"use client";

import { uid } from "../draft";
import { addFriend, markUsed, ME_ID, type Friend, type FriendGroup } from "../friends";
import type { Person, PersonColor } from "../types";
import { load, save } from "./storage";

const FRIENDS = "bs:friends";
const GROUPS = "bs:groups";
const LAST = "bs:lastCrew";

export function getFriends(): Friend[] {
  const f = load<Friend[]>(FRIENDS, []);
  return Array.isArray(f) ? f : [];
}
export function saveFriends(f: Friend[]): void {
  save(FRIENDS, f);
}
export function getGroups(): FriendGroup[] {
  const g = load<FriendGroup[]>(GROUPS, []);
  return Array.isArray(g) ? g : [];
}
export function saveGroups(g: FriendGroup[]): void {
  save(GROUPS, g);
}
export function getLastCrew(): string[] {
  const l = load<string[]>(LAST, []);
  return Array.isArray(l) ? l : [];
}

/** Adds (or finds, by name) a friend and returns it. */
export function ensureFriend(input: { name: string; emoji?: string; color?: PersonColor }): Friend {
  const r = addFriend(getFriends(), input, uid());
  if (r.created) saveFriends(r.friends);
  return r.friend;
}

/**
 * After a split is shared: make sure everyone is a saved friend, bump
 * "recently used", and remember the crew for "Same as last time".
 */
export function rememberPeople(people: Person[]): void {
  let friends = getFriends();
  const ids: string[] = [];
  for (const p of people) {
    if (p.id === ME_ID) continue;
    const byId = friends.find((f) => f.id === p.id);
    if (byId) {
      ids.push(byId.id);
      continue;
    }
    const r = addFriend(friends, { name: p.name, emoji: p.emoji, color: p.color }, p.id);
    friends = r.friends;
    ids.push(r.friend.id);
  }
  saveFriends(markUsed(friends, ids, Date.now()));
  save(LAST, ids);
}
