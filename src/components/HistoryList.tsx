"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteHistory, getHistory, patchHistory, type HistoryEntry } from "@/lib/client/storage";
import { formatMoney } from "@/lib/money";
import { cx } from "./ui";

export function HistoryList() {
  const [entries, setEntries] = useState<HistoryEntry[]>(getHistory);
  const [gone, setGone] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Refresh paid progress for the most recent splits.
    getHistory().slice(0, 20).forEach(async (h) => {
      try {
        const r = await fetch(`/api/splits/${h.id}/paid`, { cache: "no-store" });
        if (r.status === 404) {
          setGone((g) => new Set(g).add(h.id));
          return;
        }
        if (!r.ok) return;
        const data: { paid: string[]; people: number } = await r.json();
        patchHistory(h.id, { paid: data.paid.length, people: data.people });
        setEntries((es) => es.map((e) => (e.id === h.id ? { ...e, paid: data.paid.length, people: data.people } : e)));
      } catch {
        /* offline — show cached progress */
      }
    });
  }, []);

  if (entries.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-zinc-500">No splits yet. Splits you share are listed here, on this device only.</p>
        <Link href="/" className="btn-primary mt-4">
          Start a split
        </Link>
      </div>
    );
  }

  function remove(id: string) {
    if (!confirm("Remove this split from your history? The shared link keeps working until it expires.")) return;
    deleteHistory(id);
    setEntries((es) => es.filter((e) => e.id !== id));
  }

  return (
    <ul className="space-y-2">
      {entries.map((h) => {
        const done = h.people > 0 && h.paid >= h.people;
        const expired = gone.has(h.id);
        return (
          <li key={h.id} className={cx("card flex items-center gap-2 p-2 pl-4", expired && "opacity-60")}>
            <Link href={`/s/${h.id}`} className="min-h-11 min-w-0 flex-1 py-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold">{h.title}</span>
                <span className="shrink-0 font-bold tabular-nums">{formatMoney(h.total, h.currency)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
                <span>{new Date(h.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                <span aria-hidden>·</span>
                {expired ? (
                  <span>Expired</span>
                ) : (
                  <span className={done ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
                    {done ? "✓ All paid" : `${h.paid}/${h.people} paid`}
                  </span>
                )}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${h.people ? Math.min(100, (h.paid / h.people) * 100) : 0}%` }}
                />
              </div>
            </Link>
            <button
              type="button"
              className="grid size-11 shrink-0 place-items-center rounded-xl text-xl text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
              aria-label={`Remove ${h.title} from history`}
              onClick={() => remove(h.id)}
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
