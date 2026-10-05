"use client";

import { CheckCircle2, ChevronRight, ReceiptText, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  byBillDate,
  deleteHistory,
  getHistory,
  historyFromDoc,
  patchHistory,
  type HistoryEntry,
} from "@/lib/client/storage";
import { askConfirm } from "@/lib/client/confirm";
import type { SplitDoc } from "@/lib/types";
import { Avatar, ICON, Money, cx } from "./ui";

export function HistoryList() {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => byBillDate(getHistory()));
  const [gone, setGone] = useState<Set<string>>(new Set());
  // Tapping a person in a row shows only the splits they're in.
  const [person, setPerson] = useState<Member | null>(null);

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
            patch = {
              ...historyFromDoc(data.doc),
              people: ids.size,
              paid: data.paid.filter((p) => ids.has(p)).length,
            };
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

  const shown = person ? entries.filter((h) => h.members?.some((m) => samePerson(m, person))) : entries;

  function filterBy(m: Member) {
    setPerson((cur) => (cur && samePerson(cur, m) ? null : m));
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="space-y-3.5">
      {person && (
        <div className="card flex items-center gap-3 py-3 pr-3 pl-5" aria-live="polite">
          <Avatar person={person} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">Splits with {person.name}</p>
            <p className="text-[13px] text-ink-2">
              {shown.length} {shown.length === 1 ? "split" : "splits"}
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Show all splits" onClick={() => setPerson(null)}>
            <X size={22} {...ICON} />
          </button>
        </div>
      )}

      {shown.length > 0 && (
        <ul className="card rows overflow-hidden">
          {shown.map((h) => {
            const done = h.people > 0 && h.paid >= h.people;
            const expired = gone.has(h.id);
            return (
              <li
                key={h.id}
                className={cx("relative flex min-h-[72px] items-center gap-1 pr-2", expired && "opacity-60")}
              >
                <div className="min-w-0 flex-1 py-3 pl-5">
                  <div className="flex items-baseline justify-between gap-2">
                    {/* The link's ::after covers the whole row; the people chips sit above it. */}
                    <Link
                      href={`/s/${h.id}`}
                      className="truncate font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent"
                    >
                      {h.title}
                    </Link>
                    <Money value={h.total} currency={h.currency} className="shrink-0 font-semibold" />
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-2">
                    <span>
                      {new Date(h.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
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
                  </div>
                  {h.members && h.members.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="People in this split">
                      {h.members.map((m) => {
                        const on = !!person && samePerson(m, person);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            aria-pressed={on}
                            aria-label={on ? `Show all splits` : `Show splits with ${m.name}`}
                            onClick={() => filterBy(m)}
                            className={cx(
                              // 32px chip with a 44px-tall hit area.
                              "press relative z-10 inline-flex h-8 max-w-40 items-center gap-1.5 rounded-full pr-3 pl-1 text-[13px] after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
                              on ? "bg-accent-soft font-semibold text-accent" : "bg-[var(--field)] text-ink",
                            )}
                          >
                            <Avatar person={m} size={24} />
                            <span className="truncate">{m.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--field)]">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${h.people ? Math.min(100, (h.paid / h.people) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <ChevronRight size={20} {...ICON} aria-hidden className="shrink-0 text-ink-3" />
                <button
                  type="button"
                  className="icon-plain relative z-10 size-11"
                  aria-label={`Remove ${h.title} from history`}
                  onClick={() => remove(h.id)}
                >
                  <Trash2 size={20} {...ICON} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type Member = NonNullable<HistoryEntry["members"]>[number];

/** Same person across splits: same id, or (for names typed into one split) same name. */
function samePerson(a: Member, b: Member): boolean {
  return a.id === b.id || a.name.trim().toLocaleLowerCase() === b.name.trim().toLocaleLowerCase();
}
