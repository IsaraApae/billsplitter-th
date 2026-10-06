"use client";

import { Check, CheckCircle2, ChevronRight, Layers, ReceiptText, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  byBillDate,
  deleteEvent,
  deleteHistory,
  getEditToken,
  getEvents,
  getHistory,
  historyFromDoc,
  paidProgress,
  patchHistory,
  type EventEntry,
  type HistoryEntry,
} from "@/lib/client/storage";
import { askConfirm } from "@/lib/client/confirm";
import { getFriends } from "@/lib/client/friendsStore";
import { ME_ID } from "@/lib/friends";
import { formatMoney } from "@/lib/money";
import type { SplitDoc } from "@/lib/types";
import { EventEditor } from "./EventEditor";
import { Avatar, ICON, Money, cx } from "./ui";

export function HistoryList() {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => byBillDate(getHistory()));
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<EventEntry[]>(getEvents);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  // Tapping a person in a row (or a friend on the Friends page, via
  // ?person=<id>) shows only the splits they're in.
  const personParam = useSearchParams().get("person");
  const [person, setPerson] = useState<Member | null>(() => {
    if (!personParam) return null;
    const inSplit = entries.flatMap((h) => h.members ?? []).find((m) => m.id === personParam);
    const friend = getFriends().find((f) => f.id === personParam);
    return inSplit ?? (friend ? { id: friend.id, name: friend.name, emoji: friend.emoji, color: friend.color } : null);
  });

  useEffect(() => {
    // Refresh paid progress for the most recent splits. Older entries don't
    // know who's in them yet: those load the whole split once instead.
    byBillDate(getHistory())
      .slice(0, 20)
      .forEach(async (h) => {
        try {
          // Entries saved before people/amounts were kept load the whole split once.
          const full = !h.members || h.members.some((m) => m.amount === undefined);
          const r = await fetch(full ? `/api/splits/${h.id}` : `/api/splits/${h.id}/paid`, { cache: "no-store" });
          if (r.status === 404) {
            setGone((g) => new Set(g).add(h.id));
            return;
          }
          if (!r.ok) return;
          let patch: Partial<HistoryEntry>;
          if (full) {
            const data: { doc: SplitDoc; paid: string[]; partial?: Record<string, number> } = await r.json();
            const ids = data.doc.people.map((p) => p.id);
            const paidIds = data.paid.filter((p) => ids.includes(p));
            patch = {
              ...historyFromDoc(data.doc),
              ...paidProgress(ids, paidIds),
              paidIds,
              partialPaid: data.partial ?? {},
            };
          } else {
            const data: { paid: string[]; partial?: Record<string, number> } = await r.json();
            patch = {
              ...paidProgress(h.personIds ?? [], data.paid),
              paidIds: data.paid,
              partialPaid: data.partial ?? {},
            };
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
  // Big bills hold their splits; everything else is listed on its own. Newest first.
  const inEvent = new Set(events.flatMap((e) => e.splitIds));
  const groups = [
    ...events
      .map((event) => ({
        kind: "event" as const,
        event,
        entries: shown.filter((h) => event.splitIds.includes(h.id)),
        time: Date.parse(`${event.date}T12:00`),
      }))
      .filter((g) => g.entries.length > 0 || !person),
    ...shown
      .filter((h) => !inEvent.has(h.id))
      .map((entry) => ({ kind: "entry" as const, entry, time: Date.parse(entry.createdAt) })),
  ].sort((a, b) => b.time - a.time);
  const balance = person && person.id !== ME_ID ? balanceWith(person, shown) : null;
  const mine = person?.id === ME_ID ? myMoney(shown) : null;

  async function removeEvent(e: EventEntry) {
    const ok = await askConfirm({
      title: "Remove this big bill from history?",
      message: "Its bills stay in History, and its link keeps working until it expires.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    deleteEvent(e.id);
    setEvents(getEvents());
  }

  function filterBy(m: Member | null) {
    setPerson((cur) => (!m || (cur && samePerson(cur, m)) ? null : m));
    if (personParam) window.history.replaceState(null, "", "/history"); // a reload shouldn't bring it back
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
              {balance && balance.owesYou.length > 0 && (
                <>
                  {" · owes you "}
                  <b className="tnum text-ink">{balance.owesYou.join(" + ")}</b>
                </>
              )}
              {balance && balance.youOwe.length > 0 && (
                <>
                  {" · you owe them "}
                  <b className="tnum text-ink">{balance.youOwe.join(" + ")}</b>
                </>
              )}
              {balance?.known && balance.owesYou.length + balance.youOwe.length === 0 && " · all settled"}
              {mine && mine.spent.length > 0 && (
                <>
                  {" · you spent "}
                  <b className="tnum text-ink">{mine.spent.join(" + ")}</b>
                </>
              )}
              {mine && mine.owedToYou.length > 0 && (
                <>
                  {" · friends owe you "}
                  <b className="tnum text-ink">{mine.owedToYou.join(" + ")}</b>
                </>
              )}
              {mine && mine.youOwe.length > 0 && (
                <>
                  {" · you owe "}
                  <b className="tnum text-ink">{mine.youOwe.join(" + ")}</b>
                </>
              )}
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Show all splits" onClick={() => filterBy(null)}>
            <X size={22} {...ICON} />
          </button>
        </div>
      )}

      {!person && entries.some((h) => getEditToken(h.id)) && (
        <button type="button" className="btn-secondary h-11 w-full" onClick={() => setCreating(true)}>
          <Layers size={20} {...ICON} aria-hidden /> New big bill
        </button>
      )}

      {groups.length > 0 && (
        <ul className="card rows overflow-hidden">
          {groups.map((g) =>
            g.kind === "event" ? (
              <EventRow
                key={g.event.id}
                event={g.event}
                entries={g.entries}
                gone={gone}
                person={person}
                onFilter={filterBy}
                onRemoveSplit={remove}
                onRemove={() => removeEvent(g.event)}
              />
            ) : (
              <EntryRow
                key={g.entry.id}
                h={g.entry}
                expired={gone.has(g.entry.id)}
                person={person}
                onFilter={filterBy}
                onRemove={() => remove(g.entry.id)}
              />
            ),
          )}
        </ul>
      )}

      <EventEditor
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(e) => {
          setCreating(false);
          setEvents(getEvents());
          router.push(`/e/${e.id}`);
        }}
      />
    </div>
  );
}

type Member = NonNullable<HistoryEntry["members"]>[number];

/** One split in the list (also used inside a big bill, `nested`). */
function EntryRow({
  h,
  expired,
  person,
  onFilter,
  onRemove,
  nested = false,
}: {
  h: HistoryEntry;
  expired: boolean;
  person: Member | null;
  onFilter: (m: Member) => void;
  onRemove: () => void;
  nested?: boolean;
}) {
  const done = h.people > 0 && h.paid >= h.people;
  return (
    <li
      className={cx(
        "relative flex items-center gap-1 pr-2",
        nested ? "min-h-[60px] pl-2" : "min-h-[72px]",
        expired && "opacity-60",
      )}
    >
      <div className={cx("min-w-0 flex-1 pl-5", nested ? "py-2" : "py-3")}>
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
                  onClick={() => onFilter(m)}
                  className={cx(
                    // 32px chip with a 44px-tall hit area.
                    "press relative z-10 inline-flex h-8 max-w-40 items-center gap-1.5 rounded-full pr-3 pl-1 text-[13px] after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
                    on ? "bg-accent-soft font-semibold text-accent" : "bg-[var(--field)] text-ink",
                  )}
                >
                  <Avatar person={m} size={24} />
                  <span className="truncate">{m.name}</span>
                  {on &&
                    m.amount !== undefined &&
                    (m.id === ME_ID ? (
                      <span className="tnum">{formatMoney(m.amount, h.currency)}</span>
                    ) : (
                      <>
                        <span className="tnum">{formatMoney(Math.abs(m.amount), h.currency)}</span>
                        {h.paidIds?.includes(m.id) && <Check size={14} {...ICON} aria-label="paid" />}
                      </>
                    ))}
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
        onClick={onRemove}
      >
        <Trash2 size={20} {...ICON} />
      </button>
    </li>
  );
}

/** A big bill: its own row (opens the combined page) with its bills inside. */
function EventRow({
  event,
  entries,
  gone,
  person,
  onFilter,
  onRemoveSplit,
  onRemove,
}: {
  event: EventEntry;
  entries: HistoryEntry[];
  gone: Set<string>;
  person: Member | null;
  onFilter: (m: Member) => void;
  onRemoveSplit: (id: string) => void;
  onRemove: () => void;
}) {
  const currency = entries[0]?.currency ?? "THB";
  const total = entries.reduce((s, h) => s + h.total, 0);
  // Count friends, not bill-by-bill ticks: paid means paid in every bill they're in
  // (matching the big bill's own page).
  const friendPaid = new Map<string, boolean>();
  for (const h of entries)
    for (const m of h.members ?? [])
      if (m.id !== ME_ID) friendPaid.set(m.id, (friendPaid.get(m.id) ?? true) && !!h.paidIds?.includes(m.id));
  const people = friendPaid.size || entries.reduce((s, h) => s + h.people, 0);
  const paid = friendPaid.size ? [...friendPaid.values()].filter(Boolean).length : entries.reduce((s, h) => s + h.paid, 0);
  const done = people > 0 && paid >= people;
  return (
    <li>
      <div className="relative flex min-h-[72px] items-center gap-1 pr-2">
        <div className="min-w-0 flex-1 py-3 pl-5">
          <div className="flex items-baseline justify-between gap-2">
            <Link
              href={`/e/${event.id}`}
              className="inline-flex min-w-0 items-center gap-1.5 font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent"
            >
              <Layers size={18} {...ICON} aria-hidden className="shrink-0 text-accent" />
              <span className="truncate">{event.title}</span>
            </Link>
            <Money value={total} currency={currency} className="shrink-0 font-semibold" />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-2">
            <span>
              {new Date(`${event.date}T12:00`).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <span aria-hidden>·</span>
            <span>
              Big bill · {event.splitIds.length} {event.splitIds.length === 1 ? "bill" : "bills"}
            </span>
            <span aria-hidden>·</span>
            {done ? (
              <span className="inline-flex items-center gap-1 font-semibold text-accent">
                <CheckCircle2 size={14} {...ICON} aria-hidden /> All paid
              </span>
            ) : (
              <span className="font-semibold text-warn">{`${paid}/${people} paid`}</span>
            )}
          </div>
        </div>
        <ChevronRight size={20} {...ICON} aria-hidden className="shrink-0 text-ink-3" />
        <button
          type="button"
          className="icon-plain relative z-10 size-11"
          aria-label={`Remove big bill ${event.title} from history`}
          onClick={onRemove}
        >
          <Trash2 size={20} {...ICON} />
        </button>
      </div>
      {entries.length > 0 && (
        // The small bills inside, on a faint rail.
        <ul className="relative mb-3 ml-5 space-y-1 before:absolute before:top-1 before:bottom-1 before:left-0 before:w-0.5 before:rounded-full before:bg-[var(--line)]">
          {entries.map((h) => (
            <EntryRow
              key={h.id}
              h={h}
              expired={gone.has(h.id)}
              person={person}
              onFilter={onFilter}
              onRemove={() => onRemoveSplit(h.id)}
              nested
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * What a friend still owes you across these splits (unpaid amounts), and
 * what you owe them back (they paid upfront), formatted per currency.
 */
function balanceWith(person: Member, entries: HistoryEntry[]): { owesYou: string[]; youOwe: string[]; known: boolean } {
  const owes = new Map<string, number>();
  const owed = new Map<string, number>();
  let known = true;
  for (const h of entries) {
    const m = h.members?.find((x) => samePerson(x, person));
    if (!m || m.amount === undefined || !h.paidIds) known = false;
    if (!m || m.amount === undefined || h.paidIds?.includes(m.id)) continue;
    const into = m.amount > 0 ? owes : owed;
    // Less anything they've paid towards it so far.
    const left = m.amount > 0 ? Math.max(0, m.amount - (h.partialPaid?.[m.id] ?? 0)) : -m.amount;
    into.set(h.currency, (into.get(h.currency) ?? 0) + left);
  }
  const fmt = (map: Map<string, number>) =>
    [...map].filter(([, v]) => v > 0).map(([currency, v]) => formatMoney(v, currency));
  return { owesYou: fmt(owes), youOwe: fmt(owed), known };
}

/**
 * The organiser's money across these splits: their own shares, what friends
 * still owe them, and what they owe friends who paid upfront (per currency).
 */
function myMoney(entries: HistoryEntry[]): { spent: string[]; owedToYou: string[]; youOwe: string[] } {
  const spent = new Map<string, number>();
  const owed = new Map<string, number>();
  const owe = new Map<string, number>();
  const add = (map: Map<string, number>, currency: string, v: number) =>
    map.set(currency, (map.get(currency) ?? 0) + v);
  for (const h of entries) {
    for (const m of h.members ?? []) {
      if (m.amount === undefined) continue;
      if (m.id === ME_ID) add(spent, h.currency, m.amount);
      else if (!h.paidIds?.includes(m.id))
        add(
          m.amount > 0 ? owed : owe,
          h.currency,
          m.amount > 0 ? Math.max(0, m.amount - (h.partialPaid?.[m.id] ?? 0)) : -m.amount,
        );
    }
  }
  const fmt = (map: Map<string, number>) =>
    [...map].filter(([, v]) => v > 0).map(([currency, v]) => formatMoney(v, currency));
  return { spent: fmt(spent), owedToYou: fmt(owed), youOwe: fmt(owe) };
}

/** Same person across splits: same id, or (for names typed into one split) same name. */
function samePerson(a: Member, b: Member): boolean {
  return a.id === b.id || a.name.trim().toLocaleLowerCase() === b.name.trim().toLocaleLowerCase();
}
