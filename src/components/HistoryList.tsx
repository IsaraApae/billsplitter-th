"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteHistory, getHistory, patchHistory, type HistoryEntry } from "@/lib/client/storage";
import { Money, cx } from "./ui";

export function HistoryList() {
  const [entries, setEntries] = useState<HistoryEntry[]>(getHistory);
  const [gone, setGone] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Refresh paid progress for the most recent splits.
    getHistory()
      .slice(0, 20)
      .forEach(async (h) => {
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
      <div className="glass rounded-[28px] p-8 text-center">
        <p className="text-ink-2">No splits yet. Splits you share are listed here, on this device only.</p>
        <Link href="/" className="btn-primary mt-5 h-12">
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
    <ul className="space-y-2.5">
      {entries.map((h) => {
        const done = h.people > 0 && h.paid >= h.people;
        const expired = gone.has(h.id);
        return (
          <li key={h.id} className={cx("card flex items-center gap-1 p-2 pl-4", expired && "opacity-60")}>
            <Link href={`/s/${h.id}`} className="min-h-12 min-w-0 flex-1 py-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold">{h.title}</span>
                <Money value={h.total} currency={h.currency} className="shrink-0 text-[17px] font-bold" />
              </div>
              <div className="mt-1 flex items-center gap-2 text-[13px] text-ink-2">
                <span>
                  {new Date(h.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
                <span aria-hidden>·</span>
                {expired ? (
                  <span>Expired</span>
                ) : (
                  <span className={cx("font-semibold", done ? "text-accent" : "text-warn")}>
                    {done ? "✓ All paid" : `${h.paid}/${h.people} paid`}
                  </span>
                )}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--hover)]">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${h.people ? Math.min(100, (h.paid / h.people) * 100) : 0}%` }}
                />
              </div>
            </Link>
            <button
              type="button"
              className="icon-btn hover:bg-danger-soft hover:text-danger"
              aria-label={`Remove ${h.title} from history`}
              onClick={() => remove(h.id)}
            >
              <Trash2 size={18} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
