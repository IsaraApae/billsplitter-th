"use client";

import { useEffect, useMemo, useState } from "react";
import { lastSplitDates } from "../friends";
import type { SplitDoc } from "../types";
import { byBillDate, getHistory, historyFromDoc, patchHistory, type HistoryEntry } from "./storage";

/**
 * This device's History, newest bill date first. Older entries don't record
 * who was in them: those are looked up once from the saved split (with its
 * bill date, which may have been edited) and the list updates.
 */
export function useSplitHistory(): HistoryEntry[] {
  const [history, setHistory] = useState<HistoryEntry[]>(() => byBillDate(getHistory()));

  useEffect(() => {
    const missing = getHistory()
      .filter((h) => !h.personIds || !h.members)
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
          patchHistory(h.id, historyFromDoc(data.doc));
        } catch {
          /* offline — try again next time */
        }
      }
      if (!cancelled) setHistory(byBillDate(getHistory()));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return history;
}

/** Each person's newest bill date (epoch ms), from `useSplitHistory`. */
export function useLastSplitDates(history: HistoryEntry[]): Map<string, number> {
  return useMemo(() => lastSplitDates(history), [history]);
}

/** Ids of everyone in the newest split (by bill date) whose people are known. */
export function newestSplitPeople(history: HistoryEntry[]): string[] | null {
  return byBillDate(history).find((h) => h.personIds)?.personIds ?? null;
}
