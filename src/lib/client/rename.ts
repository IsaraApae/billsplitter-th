"use client";

import type { Person, SplitDoc } from "../types";
import { getEditToken, getHistory, historyFromDoc, load, patchHistory, save } from "./storage";

type Look = Pick<Person, "name" | "emoji" | "color">;

const same = (a: Look, b: Look) => a.name === b.name && (a.emoji ?? "") === (b.emoji ?? "") && (a.color ?? "") === (b.color ?? "");

/**
 * After renaming a friend (or yourself, id "me"): updates that person in
 * every split you shared that they're in (so the links show the new name),
 * and in the draft you're working on. Returns how many shared splits changed.
 */
export async function renameEverywhere(personId: string, look: Look): Promise<number> {
  const name = look.name.trim();
  if (!name) return 0;
  const next: Look = { ...look, name };

  // The draft being edited.
  const draft = load<{ doc?: SplitDoc } | null>("bs:draft", null);
  if (draft?.doc?.people?.some((p) => p.id === personId)) {
    draft.doc.people = draft.doc.people.map((p) => (p.id === personId ? { ...p, ...next } : p));
    save("bs:draft", draft);
  }

  // Shared splits this device can edit that (may) include them.
  const candidates = getHistory()
    .filter((h) => getEditToken(h.id))
    .filter((h) => !h.personIds || h.personIds.includes(personId))
    .slice(0, 50);
  let changed = 0;
  for (const h of candidates) {
    try {
      const r = await fetch(`/api/splits/${h.id}`, { cache: "no-store" });
      if (!r.ok) continue;
      const { doc } = (await r.json()) as { doc: SplitDoc };
      const person = doc.people.find((p) => p.id === personId);
      if (!person || same(person, next)) continue;
      const updated: SplitDoc = { ...doc, people: doc.people.map((p) => (p.id === personId ? { ...p, ...next } : p)) };
      const put = await fetch(`/api/splits/${h.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-edit-token": getEditToken(h.id)! },
        body: JSON.stringify(updated),
      });
      if (!put.ok) continue;
      patchHistory(h.id, historyFromDoc(updated));
      changed++;
    } catch {
      /* offline: that split keeps the old name */
    }
  }
  return changed;
}
