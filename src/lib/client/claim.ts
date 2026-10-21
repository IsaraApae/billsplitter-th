"use client";

import { getDeviceKey, getEditToken, getHistory, load, save } from "./storage";

const CLAIMED_AT = "bs:claimedAt";
const EVERY_MS = 12 * 60 * 60 * 1000;

async function send(splits: { id: string; token: string }[]): Promise<void> {
  const owner = getDeviceKey();
  for (let i = 0; i < splits.length; i += 200) {
    await fetch("/api/organiser/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, splits: splits.slice(i, i + 200) }),
    });
  }
}

/**
 * Tells the server which of History's splits this phone made (proven with
 * their edit tokens), so a friend's "What I owe" can find all of them, also
 * the ones whose link they never got. At most every 12 hours unless `force`.
 */
export async function claimMySplits(force = false): Promise<void> {
  try {
    if (!force && Date.now() - load<number>(CLAIMED_AT, 0) < EVERY_MS) return;
    const splits = getHistory()
      .map((h) => ({ id: h.id, token: getEditToken(h.id) }))
      .filter((s): s is { id: string; token: string } => !!s.token);
    if (splits.length) await send(splits);
    save(CLAIMED_AT, Date.now());
  } catch {
    /* offline: next time */
  }
}

/** A split just saved on this phone. */
export async function claimSplit(id: string, token: string): Promise<void> {
  try {
    await send([{ id, token }]);
  } catch {
    /* offline: the next claimMySplits covers it */
  }
}
