"use client";

import { ORGANISER_ID } from "../calc";
import { parseTransferKey, paymentSummary } from "../settle";
import type { SplitDoc } from "../types";
import { historyFromDoc, paidProgress, patchHistory, type HistoryEntry } from "./storage";

const AT_ONCE = 6;

/** Refreshes entries a few at a time, so a long History doesn't flood the phone or the rate limit. Stops when `cancelled` says so. */
export async function refreshEntries(
  entries: HistoryEntry[],
  onResult: (h: HistoryEntry, patch: Partial<HistoryEntry> | "gone") => void,
  cancelled: () => boolean = () => false,
): Promise<void> {
  for (let i = 0; i < entries.length && !cancelled(); i += AT_ONCE) {
    const batch = entries.slice(i, i + AT_ONCE);
    const patches = await Promise.all(batch.map(refreshEntry));
    if (cancelled()) return;
    batch.forEach((h, k) => {
      const p = patches[k];
      if (p) onResult(h, p);
    });
  }
}

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
      const data: { doc: SplitDoc; paid: string[]; partial?: Record<string, number>; paidAt?: Record<string, number> } = await r.json();
      patch = {
        ...historyFromDoc(data.doc),
        ...paymentSummary(data.doc, { paid: data.paid, partial: data.partial ?? {} }),
        paidAt: paidToMe(data.paidAt),
      };
    } else {
      const data: { paid: string[]; partial?: Record<string, number>; paidAt?: Record<string, number> } = await r.json();
      patch = {
        ...paidProgress(h.personIds ?? [], data.paid),
        paidIds: data.paid,
        partialPaid: data.partial ?? {},
        paidAt: paidToMe(data.paidAt),
      };
    }
    patchHistory(h.id, patch);
    return patch;
  } catch {
    return null;
  }
}

/** Payment times by friend: a transfer to you ("t:mint:me") counts as Mint's. */
function paidToMe(paidAt: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, t] of Object.entries(paidAt)) {
    const tr = parseTransferKey(k);
    if (!tr) out[k] = t;
    else if (tr.to === ORGANISER_ID) out[tr.from] = t;
  }
  return out;
}
