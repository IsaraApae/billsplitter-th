"use client";

import { CheckCheck, ChevronDown, ChevronRight, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { claimMySplits } from "@/lib/client/claim";
import { askConfirm } from "@/lib/client/confirm";
import { refreshEntry } from "@/lib/client/historyRefresh";
import { getEditToken, getHistory, type HistoryEntry } from "@/lib/client/storage";
import { owedToYou, type OwedBill, type OwedFriend } from "@/lib/owed";
import { getProfile } from "@/lib/client/profile";
import { BoardLinkCard } from "./BoardLinkCard";
import { PaidMark, PaymentSheet, type PaymentInput } from "./Payments";
import { Avatar, Callout, ICON, Money, cx } from "./ui";

/** "Owed to you": each friend who still owes you, across your splits. */
export function OwedToYou() {
  const [entries, setEntries] = useState<HistoryEntry[]>(getHistory);
  const [open, setOpen] = useState<string | null>(null);
  const [myName] = useState(() => getProfile().name.trim() || "you");
  // The bill whose payment is being recorded, and for whom.
  const [ask, setAsk] = useState<{ f: OwedFriend; b: OwedBill } | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

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
      {error && <Callout tone="error">{error}</Callout>}
      <ul className="card rows overflow-hidden">
        {friends.map((f) => (
          <FriendRow
            key={`${f.key}|${f.currency}`}
            f={f}
            open={open === f.key + f.currency}
            onToggle={() => setOpen((o) => (o === f.key + f.currency ? null : f.key + f.currency))}
            busy={busy}
            onAsk={(b) => setAsk({ f, b })}
            onMarkAll={() => void markAll(f)}
          />
        ))}
      </ul>
      <p className="px-5 text-[13px] text-ink-2">Tap a name to see their unpaid bills; tap a circle to tick a payment.</p>
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
  open,
  onToggle,
  busy,
  onAsk,
  onMarkAll,
}: {
  f: OwedFriend;
  open: boolean;
  onToggle: () => void;
  busy: Set<string>;
  onAsk: (b: OwedBill) => void;
  onMarkAll: () => void;
}) {
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
