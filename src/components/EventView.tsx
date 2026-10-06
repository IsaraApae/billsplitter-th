"use client";

import { ChevronDown, ChevronRight, Layers, PartyPopper, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculate } from "@/lib/calc";
import { useBrowserValue } from "@/lib/client/hooks";
import { getEditToken, getEvents, upsertEvent } from "@/lib/client/storage";
import { eventPeople, type EventBill, type EventMeta, type EventPerson } from "@/lib/event";
import { EventEditor } from "./EventEditor";
import { PayQr, type PayQrSource } from "./PayQr";
import { PaidMark, PaymentSheet, type PaymentInput } from "./Payments";
import { ShareButtons } from "./ShareButtons";
import { Avatar, Callout, ICON, Money, Section, Sheet, cx } from "./ui";

const POLL_MS = 10_000;

/** A "big bill": several splits from one outing, with one total per person. */
export function EventView({
  id,
  meta,
  initialBills,
  qr,
}: {
  id: string;
  meta: EventMeta & { updatedAt: string };
  initialBills: EventBill[];
  qr: PayQrSource | null;
}) {
  const router = useRouter();
  const [bills, setBills] = useState(initialBills);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askFor, setAskFor] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const editToken = useBrowserValue(() => getEditToken(id), null);
  const canEdit = !!editToken;
  const url = `${useBrowserValue(() => window.location.origin, "")}/e/${id}`;
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const people = useMemo(() => eventPeople(bills), [bills]);
  const currency = bills[0]?.doc.currency ?? "THB";
  const grandTotal = bills.reduce((s, b) => s + calculate(b.doc).total, 0);
  const friends = people.filter((p) => !p.organiser);
  const paidCount = friends.filter((p) => p.status === "full").length;
  const partCount = friends.filter((p) => p.status === "part").length;
  const allPaid = friends.length > 0 && paidCount === friends.length;
  const outstanding = friends
    .filter((p) => p.status !== "full")
    .reduce((s, p) => s + Math.max(0, p.total - p.paidSoFar), 0);
  const waitingOn = friends.filter((p) => p.status !== "full" && p.total > 0).map((p) => p.name);
  const askPerson = people.find((p) => p.key === askFor);
  const payPerson = people.find((p) => p.key === payFor);
  const missing = meta.splitIds.length - bills.length;

  // Keep this device's copy of the big bill in step (title/date/bills).
  useEffect(() => {
    if (getEvents().some((e) => e.id === id)) upsertEvent({ id, title: meta.title, date: meta.date, splitIds: meta.splitIds });
  }, [id, meta]);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible" || busyRef.current) return;
    try {
      const r = await fetch(`/api/events/${id}`, { cache: "no-store" });
      if (r.status === 404) {
        router.refresh();
        return;
      }
      if (!r.ok) return;
      const data: { bills: EventBill[] } = await r.json();
      if (!busyRef.current) setBills(data.bills);
    } catch {
      /* offline: try again next tick */
    }
  }, [id, router]);

  useEffect(() => {
    const t = setInterval(refresh, POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  async function savePayment(person: EventPerson, input: PaymentInput) {
    if (!canEdit) return;
    setError(null);
    setBusy(person.key);
    try {
      const r = await fetch(`/api/events/${id}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(editToken ? { "x-edit-token": editToken } : {}) },
        body: JSON.stringify({ personKey: person.key, ...input }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.message ?? "Couldn't save.");
      setBills(data.bills as EventBill[]);
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : "You're offline — the payment wasn't saved.");
    } finally {
      setBusy(null);
    }
  }

  const date = new Date(`${meta.date}T12:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 pb-32 md:pb-16">
      <header className="card px-6 pt-6 pb-5 text-center">
        <p className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
          <Layers size={14} {...ICON} aria-hidden /> Big bill · {date}
        </p>
        <h1 className="mt-1 text-[28px] leading-tight font-bold tracking-tight break-words">{meta.title}</h1>
        <Money value={grandTotal} currency={currency} className="mt-3 block text-[48px] leading-none font-bold tracking-tight" />
        <p className="mt-2 text-[15px] text-ink-2">
          {bills.length} {bills.length === 1 ? "bill" : "bills"} · {people.length} {people.length === 1 ? "person" : "people"}
        </p>

        {friends.length > 0 && (
          <div className="mt-5 text-left" aria-label="Payment progress">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold">
                {allPaid && <PartyPopper size={20} {...ICON} className="text-accent" aria-hidden />}
                {allPaid
                  ? "Everyone has paid"
                  : `${paidCount} of ${friends.length} paid${partCount ? ` · ${partCount} part paid` : ""}`}
              </span>
              {!allPaid && outstanding > 0 && (
                <span className="text-[15px] text-ink-2">
                  <Money value={outstanding} currency={currency} className="font-semibold text-ink" /> to go
                </span>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--field)]">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${friends.length ? (paidCount / friends.length) * 100 : 0}%` }}
              />
            </div>
            {!allPaid && waitingOn.length > 0 && (
              <p className="mt-2 text-[15px] text-ink-2">
                Waiting on: <b className="text-ink">{waitingOn.join(", ")}</b>
              </p>
            )}
          </div>
        )}
      </header>

      {error && <Callout tone="error">{error}</Callout>}

      <Section title="Who owes what">
        <ul className="card rows overflow-hidden" aria-label="People">
          {people.map((p) => (
            <PersonRow
              key={p.key}
              person={p}
              currency={currency}
              canEdit={canEdit}
              busy={busy === p.key}
              onAsk={() => setAskFor(p.key)}
              onPay={qr && currency === "THB" ? () => setPayFor(p.key) : undefined}
            />
          ))}
        </ul>
        <p className="px-5 text-[13px] text-ink-2">
          {canEdit
            ? "Tap the circle when someone pays you. It's recorded on each bill too."
            : "Each person pays their total for all the bills at once."}
        </p>
      </Section>

      <Section title={`Bills · ${bills.length}`}>
        <ul className="card rows overflow-hidden">
          {bills.map((b) => (
            <li key={b.id}>
              <Link href={`/s/${b.id}`} className="flex min-h-[60px] items-center gap-3 py-2 pr-4 pl-5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{b.doc.title}</span>
                  <span className="block text-[13px] text-ink-2">
                    {b.doc.people.length} {b.doc.people.length === 1 ? "person" : "people"}
                  </span>
                </span>
                <Money value={calculate(b.doc).total} currency={b.doc.currency} className="font-semibold" />
                <ChevronRight size={20} {...ICON} aria-hidden className="shrink-0 text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
        {missing > 0 && (
          <p className="px-5 text-[13px] text-ink-2">
            {missing} {missing === 1 ? "bill has" : "bills have"} expired and {missing === 1 ? "isn't" : "aren't"} counted.
          </p>
        )}
      </Section>

      <section className="space-y-2.5">
        <ShareButtons url={url} title={meta.title} text={`${meta.title} — see what you owe for the whole night`} />
        {canEdit && (
          <button type="button" className="btn-secondary h-12 w-full" onClick={() => setEditing(true)}>
            <Pencil size={20} {...ICON} aria-hidden /> Edit big bill
          </button>
        )}
      </section>

      {canEdit && (
        <PaymentSheet
          open={!!askPerson}
          onClose={() => setAskFor(null)}
          name={askPerson?.name ?? ""}
          owed={Math.max(0, askPerson?.total ?? 0)}
          currency={currency}
          status={askPerson?.status ?? "none"}
          paidSoFar={askPerson?.paidSoFar ?? 0}
          onSave={(input) => askPerson && savePayment(askPerson, input)}
        />
      )}

      <Sheet open={!!payPerson} onClose={() => setPayFor(null)} title={payPerson ? `Pay ${payPerson.name}'s total` : "Pay"}>
        {payPerson && qr && (
          <PayQr source={qr} amount={Math.max(0, payPerson.total - payPerson.paidSoFar)} name={payPerson.name} />
        )}
      </Sheet>

      {canEdit && (
        <EventEditor
          open={editing}
          onClose={() => setEditing(false)}
          event={{ id, title: meta.title, date: meta.date, splitIds: meta.splitIds }}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function PersonRow({
  person: p,
  currency,
  canEdit,
  busy,
  onAsk,
  onPay,
}: {
  person: EventPerson;
  currency: string;
  canEdit: boolean;
  busy: boolean;
  onAsk: () => void;
  onPay?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const left = Math.max(0, p.total - p.paidSoFar);
  return (
    <li className={cx(p.status === "full" && !p.organiser && "opacity-70")}>
      <div className="flex min-h-[60px] items-center gap-2 py-2 pr-3 pl-4">
        {p.organiser ? (
          <span className="size-11 shrink-0" aria-hidden />
        ) : canEdit ? (
          <button
            type="button"
            className="press grid size-11 shrink-0 place-items-center rounded-full"
            disabled={busy}
            aria-label={`${p.name}: ${p.status === "full" ? "paid" : p.status === "part" ? "paid part" : "not paid"}. Change`}
            onClick={onAsk}
          >
            <PaidMark status={p.status} busy={busy} />
          </button>
        ) : (
          <span className="grid size-11 shrink-0 place-items-center" aria-hidden>
            {p.status === "none" ? <span className="size-2.5 rounded-full bg-warn" /> : <PaidMark status={p.status} />}
          </span>
        )}
        <button
          type="button"
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Avatar person={p} size={36} />
          <span className="min-w-0 flex-1">
            <span className={cx("block truncate font-semibold", p.status === "full" && !p.organiser && "line-through decoration-ink-3")}>
              {p.name}
            </span>
            <span
              className={cx(
                "block text-[13px] font-semibold",
                p.organiser ? "text-ink-2" : p.status === "none" ? (p.total < 0 ? "text-positive" : "text-warn") : "text-accent",
              )}
            >
              {p.organiser ? (
                "Organiser"
              ) : p.status === "full" ? (
                p.total < 0 ? "Paid back" : "Paid"
              ) : p.status === "part" ? (
                <>
                  Paid <Money value={p.paidSoFar} currency={currency} /> · <Money value={left} currency={currency} /> left
                </>
              ) : p.total < 0 ? (
                "Gets money back"
              ) : (
                "Unpaid"
              )}
            </span>
          </span>
          {p.total < 0 ? (
            <span className="text-right leading-tight">
              <span className="block text-[11px] text-ink-2">gets back</span>
              <Money value={-p.total} currency={currency} className="text-[19px] font-bold tracking-tight text-positive" />
            </span>
          ) : (
            <Money value={p.total} currency={currency} className="text-[19px] font-bold tracking-tight" />
          )}
          {!(onPay && !p.organiser && p.status !== "full" && left > 0) && (
            <ChevronDown size={20} {...ICON} aria-hidden className={cx("shrink-0 text-ink-3", open && "rotate-180")} />
          )}
        </button>
        {onPay && !p.organiser && p.status !== "full" && left > 0 && (
          <button type="button" className="chip-accent min-h-10 px-4" onClick={onPay}>
            Pay
          </button>
        )}
      </div>
      {open && (
        <ul className="space-y-1.5 px-5 pb-4 text-[15px]">
          {p.bills.map((b) => (
            <li key={b.splitId} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <PaidMark status={b.status} small />
                <span className="truncate">{b.title}</span>
              </span>
              <Money value={b.amount} currency={currency} tone={b.amount < 0 ? "negative" : undefined} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
