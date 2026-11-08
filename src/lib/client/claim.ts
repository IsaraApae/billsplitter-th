"use client";

import { getDeviceKey, getEditToken, getHistory, load, save } from "./storage";

const CLAIMED_AT = "bs:claimedAt";
/** ids sent since CLAIMED_AT, so a forced claim only sends new ones */
const CLAIMED = "bs:claimedIds";
const EVERY_MS = 12 * 60 * 60 * 1000;

async function send(splits: { id: string; token: string }[]): Promise<void> {
  const owner = getDeviceKey();
  for (let i = 0; i < splits.length; i += 200) {
    const r = await fetch("/api/organiser/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, splits: splits.slice(i, i + 200) }),
    });
    if (!r.ok) throw new Error("claim failed");
  }
}

const remember = (ids: string[], keep: string[]) => save(CLAIMED, [...new Set([...keep, ...ids])]);

/**
 * Tells the server which of History's splits this phone made (proven with
 * their edit tokens), so a friend's "What I owe" can find all of them, also
 * the ones whose link they never got. Every 12 hours all of them (that keeps
 * the server's record alive); in between, `force` sends only ones not sent yet.
 */
export function claimMySplits(force = false): Promise<void> {
  // One at a time, so pages asking together don't send the same bills twice.
  queue = queue.then(() => claim(force));
  return queue;
}
let queue = Promise.resolve();

async function claim(force: boolean): Promise<void> {
  try {
    const due = Date.now() - load<number>(CLAIMED_AT, 0) >= EVERY_MS;
    if (!due && !force) return;
    const sent = due ? [] : load<string[]>(CLAIMED, []);
    const splits = getHistory()
      .filter((h) => !sent.includes(h.id))
      .map((h) => ({ id: h.id, token: getEditToken(h.id) }))
      .filter((s): s is { id: string; token: string } => !!s.token);
    if (splits.length) await send(splits);
    remember(splits.map((s) => s.id), sent);
    if (due) save(CLAIMED_AT, Date.now());
  } catch {
    /* offline: next time */
  }
}

/** A split just saved on this phone. */
export async function claimSplit(id: string, token: string): Promise<void> {
  try {
    await send([{ id, token }]);
    remember([id], load<string[]>(CLAIMED, []));
  } catch {
    /* offline: the next claimMySplits covers it */
  }
}
