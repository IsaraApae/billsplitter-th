"use client";

import { CheckCheck, ChevronDown, ChevronRight, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { claimMySplits } from "@/lib/client/claim";
import { askConfirm } from "@/lib/client/confirm";
import { needsPayTimes, refreshEntries, refreshEntry } from "@/lib/client/historyRefresh";
import { getEditToken, getHistory, type HistoryEntry } from "@/lib/client/storage";
import { dayCount, daysBetween, owedToYou, paySpeed, type OwedBill, type OwedFriend } from "@/lib/owed";
import { getProfile } from "@/lib/client/profile";
import { BoardLinkCard } from "./BoardLinkCard";
import { PaidMark, PaymentSheet, type PaymentInput } from "./Payments";
import { PaySpeedList } from "./PaySpeedList";
import { Avatar, Callout, ICON, Money, cx } from "./ui";
import { langOf } from "@/lib/lang";

/** How long this friend's oldest unpaid bill has waited, in days. */
const waited = (f: OwedFriend, now: number) => Math.max(...f.bills.map((b) => daysBetween(b.date, now)));

/** "Owed to you": each friend who still owes you, across your splits. */
export function OwedToYou() {
  const [entries, setEntries] = useState<HistoryEntry[]>(getHistory);
  const [open, setOpen] = useState<string | null>(null);
  const [myName] = useState(() => getProfile().name.trim() || "you");
  // The bill whose payment is being recorded, and for whom.
  const [ask, setAsk] = useState<{ f: OwedFriend; b: OwedBill } | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(Date.now);

  /** Records a payment on one bill (with that bill's edit token), then refreshes it. */
  async function save(b: OwedBill, input: PaymentInput): Promise<boolean> {
    const token = getEditToken(b.id);
    if (!token) return false;
    const k = `${b.id}|${b.ref}`;
    setBusy((s) => new Set(s).add(k));
    try {
      const r = await fetch(`/api/splits/${b.id}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-edit-token": token },
        body: JSON.stringify({ personId: b.ref, ...input }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { message?: string } | null)?.message ?? "Couldn't save.");
      const h = getHistory().find((e) => e.id === b.id);
      const patch = h ? await refreshEntry(h) : null;
      if (patch && patch !== "gone") setEntries((es) => es.map((e) => (e.id === b.id ? { ...e, ...patch } : e)));
      return true;
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : "You're offline — the payment wasn't saved.");
      return false;
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  }

  async function markAll(f: OwedFriend) {
    const ok = await askConfirm({
      title: `Mark all of ${f.look.name}'s bills paid?`,
      message: `${f.bills.length} ${f.bills.length === 1 ? "bill gets" : "bills get"} the big tick.`,
      confirmLabel: "Mark all paid",
    });
    if (!ok) return;
    setError(null);
    // Only bills this phone made (it holds their edit keys).
    for (const b of f.bills.filter((x) => getEditToken(x.id))) if (!(await save(b, { paid: true }))) break;
  }

  // Fresh payments for the splits someone still owes on (bills everyone has paid can't add to this list).
  useEffect(() => {
    void claimMySplits();
    let cancelled = false;
    const unsettled = new Set(owedToYou(getHistory()).flatMap((f) => f.bills.map((b) => b.id)));
    void refreshEntries(
      // Older entries don't say what each person owes yet: they need a look too.
      // Ticks without a payment time are looked up (once), for "Who pays fastest".
      getHistory().filter(
        (h) => unsettled.has(h.id) || !h.members || h.members.some((m) => m.amount === undefined) || needsPayTimes(h),
      ),
      (h, patch) => {
        if (patch !== "gone") setEntries((es) => es.map((e) => (e.id === h.id ? { ...e, ...patch } : e)));
      },
      () => cancelled,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const friends = owedToYou(entries);
  const speed = paySpeed(entries, now);
  const totals = new Map<string, number>();
  for (const f of friends) totals.set(f.currency, (totals.get(f.currency) ?? 0) + f.total);
  const people = new Set(friends.map((f) => f.key)).size;

  if (friends.length === 0) {
    return (
      <div className="space-y-5">
        <div className="card p-8 text-center">
          <p className="flex items-center justify-center gap-2 text-[17px] font-semibold">
            <PartyPopper size={22} {...ICON} className="text-accent" aria-hidden /> Nobody owes you anything
          </p>
          <p className="mt-2 text-ink-2">Friends who haven&apos;t paid you yet show up here.</p>
        </div>
        <PaySpeedList speed={speed} />
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
      <BoardLinkCard
        name={myName}
        version={`${new Date(now).toDateString()}|${people}|${friends.map((f) => `${f.key}:${f.total}${f.currency}`).join()}`}
      />
      {error && <Callout tone="error">{error}</Callout>}
      <ul className="card rows overflow-hidden">
        {friends.map((f) => (
          <FriendRow
            key={`${f.key}|${f.currency}`}
            f={f}
            now={now}
            open={open === f.key + f.currency}
            onToggle={() => setOpen((o) => (o === f.key + f.currency ? null : f.key + f.currency))}
            busy={busy}
            onAsk={(b) => setAsk({ f, b })}
            onMarkAll={() => void markAll(f)}
          />
        ))}
      </ul>
      <p className="px-5 text-[13px] text-ink-2">Tap a name to see their unpaid bills; tap a circle to tick a payment.</p>
      <PaySpeedList speed={speed} />
      <PaymentSheet
        open={!!ask}
        onClose={() => setAsk(null)}
        name={ask?.f.look.name ?? ""}
        title={ask ? `Has ${ask.f.look.name} paid for ${ask.b.title}?` : undefined}
        owed={ask?.b.amount ?? 0}
        currency={ask?.f.currency ?? "THB"}
        status={ask?.b.part ? "part" : "none"}
        paidSoFar={ask?.b.paidSoFar ?? 0}
        onSave={(input) => {
          setError(null);
          if (ask) void save(ask.b, input);
        }}
      />
    </div>
  );
}

function FriendRow({
  f,
  now,
  open,
  onToggle,
  busy,
  onAsk,
  onMarkAll,
}: {
  f: OwedFriend;
  now: number;
  open: boolean;
  onToggle: () => void;
  busy: Set<string>;
  onAsk: (b: OwedBill) => void;
  onMarkAll: () => void;
}) {
  const n = f.bills.length;
  const w = waited(f, now);
  return (
    <li>
      <button type="button" className="flex min-h-[64px] w-full items-center gap-3 py-2 pr-3 pl-4 text-left" aria-expanded={open} onClick={onToggle}>
        <Avatar person={f.look} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{f.look.name}</span>
          <span className="block text-[13px] text-ink-2">
            {n} {n === 1 ? "bill" : "bills"} unpaid ·{" "}
            <span className={cx("whitespace-nowrap", w >= 7 && "font-semibold text-warn")}>{w === 0 ? "since today" : `for ${dayCount(w)}`}</span>
          </span>
        </span>
        <Money value={f.total} currency={f.currency} className="text-[17px] font-bold tracking-tight" />
        <ChevronDown size={20} {...ICON} aria-hidden className={cx("shrink-0 text-ink-3", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="pb-2">
          {f.bills.map((b) => (
            <li key={b.id} className="flex items-center pl-3">
              {getEditToken(b.id) ? (
                <button
                  type="button"
                  className="press grid size-11 shrink-0 place-items-center rounded-full"
                  disabled={busy.has(`${b.id}|${b.ref}`)}
                  aria-label={`${f.look.name}, ${b.title}: ${b.part ? "paid part" : "not paid"}. Change`}
                  onClick={() => onAsk(b)}
                >
                  <PaidMark status={b.part ? "part" : "none"} busy={busy.has(`${b.id}|${b.ref}`)} />
                </button>
              ) : (
                <span className="grid size-11 shrink-0 place-items-center" aria-hidden>
                  <PaidMark status={b.part ? "part" : "none"} small />
                </span>
              )}
              <Link href={`/s/${b.id}`} className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-1.5 pr-3 pl-1 text-[15px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate" {...langOf(b.title)}>{b.title}</span>
                  <span className="block truncate text-[13px] text-ink-2">
                    {new Date(b.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {" · "}
                    {daysBetween(b.date, now) === 0 ? "today" : `${dayCount(daysBetween(b.date, now))} ago`}
                    {b.part && <span className="font-semibold text-accent"> · Part paid</span>}
                  </span>
                </span>
                <span className="shrink-0 text-right leading-tight whitespace-nowrap">
                  {b.part && <span className="block text-[11px] text-ink-2">left to pay</span>}
                  <Money value={b.left} currency={f.currency} />
                </span>
                <ChevronRight size={18} {...ICON} className="shrink-0 text-ink-3" aria-hidden />
              </Link>
            </li>
          ))}
          <li className="flex flex-wrap items-center justify-between gap-2 px-6 py-2">
            <Link href={`/history?person=${encodeURIComponent(f.key)}`} className="text-[15px] font-semibold text-accent">
              All of {f.look.name}&apos;s splits
            </Link>
            <button type="button" className="chip-accent min-h-10 px-4" onClick={onMarkAll}>
              <CheckCheck size={18} {...ICON} aria-hidden /> Mark all paid
            </button>
          </li>
        </ul>
      )}
    </li>
  );
}
