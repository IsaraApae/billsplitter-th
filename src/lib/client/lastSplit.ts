"use client";

import { useEffect, useMemo, useState } from "react";
import { billDate } from "../draft";
import { lastSplitDates } from "../friends";
import type { SplitDoc } from "../types";
import { getHistory, patchHistory, type HistoryEntry } from "./storage";

/**
 * Each person's newest bill date (epoch ms) from this device's History.
 * Older history entries don't record who was in them: those are looked up
 * once from the saved split (with its bill date, which may have been edited).
 */
export function useLastSplitDates(): Map<string, number> {
  const [history, setHistory] = useState<HistoryEntry[]>(getHistory);

  useEffect(() => {
    const missing = getHistory()
      .filter((h) => !h.personIds)
      .slice(0, 30);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const h of missing) {
        try {
          const r = await fetch(`/api/splits/${h.id}`, { cache: "no-store" });
          if (!r.ok) continue;
          const data: { doc?: SplitDoc } = await r.json();
          if (!data.doc) continue;
          patchHistory(h.id, { personIds: data.doc.people.map((p) => p.id), createdAt: billDate(data.doc).toISOString() });
        } catch {
          /* offline — try again next time */
        }
      }
      if (!cancelled) setHistory(getHistory());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => lastSplitDates(history), [history]);
}
