"use client";

import { paymentSummary } from "../settle";
import type { SplitDoc } from "../types";
import { historyFromDoc, paidProgress, patchHistory, type HistoryEntry } from "./storage";

/**
 * Fetches a History entry's latest payments and saves them. Entries saved
 * before people/amounts were kept, and bills where friends pay each payer
 * directly, load the whole split instead. Resolves to the patch, "gone" if
 * the split expired, or null (offline or an error: keep what's cached).
 */
export async function refreshEntry(h: HistoryEntry): Promise<Partial<HistoryEntry> | "gone" | null> {
  try {
    const full = !h.members || h.members.some((m) => m.amount === undefined) || h.direct;
    const r = await fetch(full ? `/api/splits/${h.id}` : `/api/splits/${h.id}/paid`, { cache: "no-store" });
    if (r.status === 404) return "gone";
    if (!r.ok) return null;
    let patch: Partial<HistoryEntry>;
    if (full) {
      const data: { doc: SplitDoc; paid: string[]; partial?: Record<string, number> } = await r.json();
      patch = {
        ...historyFromDoc(data.doc),
        ...paymentSummary(data.doc, { paid: data.paid, partial: data.partial ?? {} }),
      };
    } else {
      const data: { paid: string[]; partial?: Record<string, number> } = await r.json();
      patch = {
        ...paidProgress(h.personIds ?? [], data.paid),
        paidIds: data.paid,
        partialPaid: data.partial ?? {},
      };
    }
    patchHistory(h.id, patch);
    return patch;
  } catch {
    return null;
  }
}
