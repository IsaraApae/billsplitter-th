"use client";

import { CheckCircle2, ChevronRight, ReceiptText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { byBillDate, deleteHistory, getHistory, historyFromDoc, patchHistory, type HistoryEntry } from "@/lib/client/storage";
import { askConfirm } from "@/lib/client/confirm";
import type { SplitDoc } from "@/lib/types";
import { Avatar, ICON, Money, cx } from "./ui";

export function HistoryList() {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => byBillDate(getHistory()));
  const [gone, setGone] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Refresh paid progress for the most recent splits. Older entries don't
    // know who's in them yet: those load the whole split once instead.
    byBillDate(getHistory())
      .slice(0, 20)
      .forEach(async (h) => {
        try {
          const full = !h.members;
          const r = await fetch(full ? `/api/splits/${h.id}` : `/api/splits/${h.id}/paid`, { cache: "no-store" });
          if (r.status === 404) {
            setGone((g) => new Set(g).add(h.id));
            return;
          }
          if (!r.ok) return;
          let patch: Partial<HistoryEntry>;
          if (full) {
            const data: { doc: SplitDoc; paid: string[] } = await r.json();
            const ids = new Set(data.doc.people.map((p) => p.id));
            patch = { ...historyFromDoc(data.doc), people: ids.size, paid: data.paid.filter((p) => ids.has(p)).length };
          } else {
            const data: { paid: string[]; people: number } = await r.json();
            patch = { paid: data.paid.length, people: data.people };
          }
          patchHistory(h.id, patch);
          setEntries((es) => byBillDate(es.map((e) => (e.id === h.id ? { ...e, ...patch } : e))));
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
                {h.members && h.members.length > 0 && (
                  <span className="mt-1.5 flex items-center gap-2" aria-label={`With ${h.members.map((m) => m.name).join(", ")}`}>
                    <span className="flex shrink-0 -space-x-1.5">
                      {h.members.slice(0, 5).map((m) => (
                        <Avatar key={m.id} person={m} size={22} className="ring-2 ring-[var(--bg)]" />
                      ))}
                    </span>
                    <span className="truncate text-[13px] text-ink-2" aria-hidden>
                      {h.members.map((m) => m.name).join(", ")}
                    </span>
                  </span>
                )}
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
