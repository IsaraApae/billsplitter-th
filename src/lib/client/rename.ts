"use client";

import type { Person, SplitDoc } from "../types";
import { getEditToken, getHistory, historyFromDoc, load, patchHistory, save, type HistoryEntry } from "./storage";

type Look = Pick<Person, "name" | "emoji" | "color">;

const same = (a: Look, b: Look) => a.name === b.name && (a.emoji ?? "") === (b.emoji ?? "") && (a.color ?? "") === (b.color ?? "");
const norm = (s: string) => s.normalize("NFC").trim().toLocaleLowerCase();

/** fetch, waiting and trying again while the server says "too many requests". */
async function patient(url: string, init?: RequestInit): Promise<Response> {
  for (let tries = 0; ; tries++) {
    const r = await fetch(url, init);
    if (r.status !== 429 || tries >= 8) return r;
    const wait = Number(r.headers.get("Retry-After")) || 8;
    await new Promise((done) => setTimeout(done, Math.min(wait, 30) * 1000));
  }
}

/**
 * Is this person in a split the one being renamed? Their id, or — for a
 * friend typed into an older split by hand (a different id) — their old name.
 * You ("me") are always matched by id.
 */
function matcher(personId: string, oldName?: string) {
  const old = personId !== "me" && oldName?.trim() ? norm(oldName) : null;
  return (p: Pick<Person, "id" | "name">) => p.id === personId || (old !== null && p.id !== "me" && norm(p.name) === old);
}

/**
 * After renaming a friend (or yourself, id "me"): updates that person in
 * every split you shared that they're in, old ones too (so the links show the
 * new name), in History, and in the draft you're working on. `oldName` also
 * finds them in splits where they were typed in by name. Returns how many
 * shared splits changed.
 */
export async function renameEverywhere(personId: string, look: Look, oldName?: string): Promise<number> {
  const name = look.name.trim();
  if (!name) return 0;
  const next: Look = { ...look, name };
  const isThem = matcher(personId, oldName);
  const rename = <T extends Pick<Person, "id" | "name">>(p: T): T => (isThem(p) ? { ...p, ...next } : p);

  // The draft being edited.
  const draft = load<{ doc?: SplitDoc } | null>("bs:draft", null);
  if (draft?.doc?.people?.some(isThem)) {
    draft.doc.people = draft.doc.people.map(rename);
    save("bs:draft", draft);
  }

  const history = getHistory();
  // History shows the new name straight away, also for splits this device can't edit.
  for (const h of history) {
    if (h.members?.some(isThem)) patchHistory(h.id, { members: h.members.map(rename) });
  }

  // Every shared split this device can edit that (may) include them.
  const mayInclude = (h: HistoryEntry) =>
    !h.members || h.members.some(isThem) || !h.personIds || h.personIds.includes(personId);
  const candidates = history.filter((h) => getEditToken(h.id) && mayInclude(h));
  let changed = 0;
  async function update(h: HistoryEntry) {
    try {
      const r = await patient(`/api/splits/${h.id}`, { cache: "no-store" });
      if (!r.ok) return;
      const { doc } = (await r.json()) as { doc: SplitDoc };
      if (!doc.people.some((p) => isThem(p) && !same(p, next))) return;
      const updated: SplitDoc = { ...doc, people: doc.people.map(rename) };
      const put = await patient(`/api/splits/${h.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-edit-token": getEditToken(h.id)! },
        body: JSON.stringify(updated),
      });
      if (!put.ok) return;
      patchHistory(h.id, historyFromDoc(updated));
      changed++;
    } catch {
      /* offline: that split keeps the old name */
    }
  }
  // A few at a time, so a long History is quick without flooding the server.
  for (let i = 0; i < candidates.length; i += 4) await Promise.all(candidates.slice(i, i + 4).map(update));
  return changed;
}
