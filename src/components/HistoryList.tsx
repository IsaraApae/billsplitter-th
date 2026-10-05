"use client";

import { CheckCircle2, ChevronRight, ReceiptText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { byBillDate, deleteHistory, getHistory, patchHistory, type HistoryEntry } from "@/lib/client/storage";
import { askConfirm } from "@/lib/client/confirm";
import { ICON, Money, cx } from "./ui";

export function HistoryList() {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => byBillDate(getHistory()));
  const [gone, setGone] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Refresh paid progress for the most recent splits.
    byBillDate(getHistory())
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
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
          <ReceiptText size={28} {...ICON} aria-hidden />
        </div>
        <p className="text-ink-2">No splits yet. Splits you share are listed here, on this device only.</p>
        <Link href="/" className="btn-primary mt-5 h-12 px-6">
          Start a split
        </Link>
      </div>
    );
  }

  async function remove(id: string) {
    const ok = await askConfirm({
      title: "Remove from history?",
      message: "The shared link keeps working until it expires.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    deleteHistory(id);
    setEntries((es) => es.filter((e) => e.id !== id));
  }

  return (
    <ul className="card rows overflow-hidden">
      {entries.map((h) => {
        const done = h.people > 0 && h.paid >= h.people;
        const expired = gone.has(h.id);
        return (
          <li key={h.id} className={cx("flex min-h-[72px] items-center gap-1 pr-2", expired && "opacity-60")}>
            <Link href={`/s/${h.id}`} className="flex min-h-[72px] min-w-0 flex-1 items-center gap-3 py-3 pl-5">
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{h.title}</span>
                  <Money value={h.total} currency={h.currency} className="shrink-0 font-semibold" />
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-2">
                  <span>
                    {new Date(h.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span aria-hidden>·</span>
                  {expired ? (
                    <span>Expired</span>
                  ) : done ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-accent">
                      <CheckCircle2 size={14} {...ICON} aria-hidden /> All paid
                    </span>
                  ) : (
                    <span className="font-semibold text-warn">{`${h.paid}/${h.people} paid`}</span>
                  )}
                </span>
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[var(--field)]">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${h.people ? Math.min(100, (h.paid / h.people) * 100) : 0}%` }}
                  />
                </span>
              </span>
              <ChevronRight size={20} {...ICON} aria-hidden className="shrink-0 text-ink-3" />
            </Link>
            <button
              type="button"
              className="icon-plain size-11"
              aria-label={`Remove ${h.title} from history`}
              onClick={() => remove(h.id)}
            >
              <Trash2 size={20} {...ICON} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
