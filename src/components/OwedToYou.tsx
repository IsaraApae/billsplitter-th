"use client";

import { ChevronDown, ChevronRight, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { claimMySplits } from "@/lib/client/claim";
import { refreshEntry } from "@/lib/client/historyRefresh";
import { getHistory, type HistoryEntry } from "@/lib/client/storage";
import { owedToYou, type OwedFriend } from "@/lib/owed";
import { getProfile } from "@/lib/client/profile";
import { BoardLinkCard } from "./BoardLinkCard";
import { PaidMark } from "./Payments";
import { Avatar, ICON, Money, cx } from "./ui";

/** "Owed to you": each friend who still owes you, across your splits. */
export function OwedToYou() {
  const [entries, setEntries] = useState<HistoryEntry[]>(getHistory);
  const [open, setOpen] = useState<string | null>(null);
  const [myName] = useState(() => getProfile().name.trim() || "you");

  // Fresh payments for every split, a few at a time.
  useEffect(() => {
    void claimMySplits();
    let cancelled = false;
    (async () => {
      const all = getHistory();
      for (let i = 0; i < all.length && !cancelled; i += 6) {
        const patches = await Promise.all(all.slice(i, i + 6).map(refreshEntry));
        if (cancelled) return;
        setEntries((es) =>
          es.map((e) => {
            const k = all.slice(i, i + 6).findIndex((h) => h.id === e.id);
            const p = k >= 0 ? patches[k] : null;
            return p && p !== "gone" ? { ...e, ...p } : e;
          }),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const friends = owedToYou(entries);
  const totals = new Map<string, number>();
  for (const f of friends) totals.set(f.currency, (totals.get(f.currency) ?? 0) + f.total);
  const people = new Set(friends.map((f) => f.key)).size;

  if (friends.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="flex items-center justify-center gap-2 text-[17px] font-semibold">
          <PartyPopper size={22} {...ICON} className="text-accent" aria-hidden /> Nobody owes you anything
        </p>
        <p className="mt-2 text-ink-2">Friends who haven&apos;t paid you yet show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="-mt-2 px-1 text-[15px] text-ink-2">
        {[...totals].map(([currency, v], i) => (
          <span key={currency}>
            {i > 0 && " + "}
            <Money value={v} currency={currency} className="font-semibold text-ink" />
          </span>
        ))}{" "}
        from {people} {people === 1 ? "friend" : "friends"}
      </p>
      <BoardLinkCard name={myName} />
      <ul className="card rows overflow-hidden">
        {friends.map((f) => (
          <FriendRow key={`${f.key}|${f.currency}`} f={f} open={open === f.key + f.currency} onToggle={() => setOpen((o) => (o === f.key + f.currency ? null : f.key + f.currency))} />
        ))}
      </ul>
      <p className="px-5 text-[13px] text-ink-2">Tap a name to see their unpaid bills.</p>
    </div>
  );
}

function FriendRow({ f, open, onToggle }: { f: OwedFriend; open: boolean; onToggle: () => void }) {
  const n = f.bills.length;
  return (
    <li>
      <button type="button" className="flex min-h-[64px] w-full items-center gap-3 py-2 pr-3 pl-4 text-left" aria-expanded={open} onClick={onToggle}>
        <Avatar person={f.look} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{f.look.name}</span>
          <span className="block text-[13px] text-ink-2">
            {n} {n === 1 ? "bill" : "bills"} unpaid
          </span>
        </span>
        <Money value={f.total} currency={f.currency} className="text-[17px] font-bold tracking-tight" />
        <ChevronDown size={20} {...ICON} aria-hidden className={cx("shrink-0 text-ink-3", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="pb-2">
          {f.bills.map((b) => (
            <li key={b.id}>
              <Link href={`/s/${b.id}`} className="flex min-h-[52px] items-center gap-3 py-1.5 pr-3 pl-6 text-[15px]">
                <PaidMark status={b.part ? "part" : "none"} small />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{b.title}</span>
                  <span className="block text-[13px] text-ink-2">
                    {new Date(b.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {b.part && <span className="font-semibold text-accent"> · Part paid</span>}
                  </span>
                </span>
                <span className="text-right leading-tight">
                  {b.part && <span className="block text-[11px] text-ink-2">left to pay</span>}
                  <Money value={b.left} currency={f.currency} />
                </span>
                <ChevronRight size={18} {...ICON} className="shrink-0 text-ink-3" aria-hidden />
              </Link>
            </li>
          ))}
          <li>
            <Link href={`/history?person=${encodeURIComponent(f.key)}`} className="block px-6 py-2 text-[15px] font-semibold text-accent">
              All of {f.look.name}&apos;s splits
            </Link>
          </li>
        </ul>
      )}
    </li>
  );
}
