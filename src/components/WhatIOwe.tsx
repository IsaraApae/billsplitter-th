"use client";

import { ChevronRight, PartyPopper, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getEditToken, getIam, getPicks, getSeen, setIam } from "@/lib/client/storage";
import { ORGANISER_ID } from "@/lib/calc";
import { namesIn, unpaidPeople, whatIOwe, whoAmI, type LoadedBill, type OweGroup, type OweLine } from "@/lib/owed";
import { isValidPromptPayId } from "@/lib/promptpay";
import { payerPromptPay } from "@/lib/settle";
import type { Person, SplitDoc } from "@/lib/types";
import { PaidMark } from "./Payments";
import { organiserQr, PayQr, type PayQrSource } from "./PayQr";
import { SlipCard } from "./SlipCard";
import { SlipUpload, type SlipResult } from "./SlipUpload";
import { Avatar, Callout, ICON, Money, Section, Sheet } from "./ui";

/** The QR for paying whoever a line is owed to (the organiser's, or a payer's own PromptPay). */
function qrFor(l: OweLine): PayQrSource | null {
  const { doc } = l.bill;
  if (doc.currency !== "THB") return null;
  if (l.toId !== ORGANISER_ID) {
    const pp = payerPromptPay(doc, l.toId);
    return pp && isValidPromptPayId(pp) ? { mode: "generate", promptpay: pp } : null;
  }
  return organiserQr(doc.payment, doc.currency);
}

/** Pay everything owed to one person: one QR for the total, one slip spread over their bills. */
function PayGroupSheet({ group, onClose, onPaid }: { group: OweGroup | null; onClose: () => void; onPaid: () => void }) {
  const first = group?.lines[0];
  const source = first ? qrFor(first) : null;
  const note = first?.toId === ORGANISER_ID ? first.bill.doc.payment.note : "";
  return (
    <Sheet open={!!group} onClose={onClose} title={group ? `Pay ${group.to.name}` : "Pay"}>
      {group && first && (
        <div className="space-y-4">
          {source ? (
            <PayQr source={source} amount={group.total} name={`To ${group.to.name}`} />
          ) : (
            <Callout tone="info">
              Send <Money value={group.total} currency={group.currency} /> to {group.to.name}
              {note ? <> — {note}</> : <> — ask them for their PromptPay or bank details</>}.
            </Callout>
          )}
          <ul className="card rows overflow-hidden text-[15px]">
            {group.lines.map((l) => (
              <li key={`${l.billId}|${l.ref}`} className="flex min-h-[48px] items-center justify-between gap-3 px-5 py-2">
                <span className="min-w-0 truncate">{l.title}</span>
                <Money value={l.left} currency={l.currency} />
              </li>
            ))}
          </ul>
          <SlipUpload<SlipResult>
            endpoint="/api/slips"
            field="items"
            personRef={JSON.stringify(group.lines.map((l) => ({ id: l.billId, ref: l.ref })))}
            currency={group.currency}
            onAccepted={onPaid}
          />
          <p className="px-1 text-[13px] text-ink-2">One slip for the total pays all these bills, oldest first.</p>
        </div>
      )}
    </Sheet>
  );
}

type BillData = { doc: SplitDoc; paid: string[]; partial?: Record<string, number> };
type Look = Pick<Person, "name" | "emoji" | "color">;

/** The bills friends shared with this phone (opened here), with their payments. */
async function loadSeenBills(): Promise<LoadedBill[]> {
  const out = new Map<string, LoadedBill>();
  await Promise.all(
    getSeen().map(async (s) => {
      try {
        if (s.kind === "split") {
          const r = await fetch(`/api/splits/${s.id}`, { cache: "no-store" });
          if (!r.ok) return;
          const d = (await r.json()) as BillData;
          out.set(s.id, { id: s.id, doc: d.doc, paid: d.paid, partial: d.partial ?? {}, href: `/s/${s.id}` });
        } else {
          const r = await fetch(`/api/events/${s.id}`, { cache: "no-store" });
          if (!r.ok) return;
          const d = (await r.json()) as { bills: (BillData & { id: string })[] };
          for (const b of d.bills) {
            if (!out.has(b.id)) out.set(b.id, { id: b.id, doc: b.doc, paid: b.paid, partial: b.partial ?? {}, href: `/e/${s.id}` });
          }
        }
      } catch {
        /* offline: skip it */
      }
    }),
  );
  // Bills this phone made are yours, not something you owe.
  return [...out.values()].filter((b) => !getEditToken(b.id));
}

const norm = (s: string) => s.normalize("NFC").trim().toLocaleLowerCase();

/**
 * The same organisers' other bills with me in them, including ones whose
 * link I never got (the organiser's phone tells the server which bills it
 * made). `picks` says who I am in each of them.
 */
async function loadOtherBills(
  seen: LoadedBill[],
  name: string | null,
  picks: Record<string, string>,
): Promise<{ bills: LoadedBill[]; picks: Record<string, string> }> {
  const known = new Set(seen.map((b) => b.id));
  const out = new Map<string, LoadedBill>();
  const found: Record<string, string> = {};
  await Promise.all(
    seen.map(async (b) => {
      const me = whoAmI(b.doc, name, picks[b.id]);
      if (!me) return;
      try {
        const q = new URLSearchParams({ person: me.id, name: me.name });
        const r = await fetch(`/api/splits/${b.id}/others?${q}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { splits: (BillData & { id: string })[] };
        for (const o of d.splits) {
          if (known.has(o.id) || out.has(o.id) || getEditToken(o.id)) continue;
          out.set(o.id, { id: o.id, doc: o.doc, paid: o.paid, partial: o.partial ?? {}, href: `/s/${o.id}` });
          const there = o.doc.people.find((p) => p.id !== "me" && (p.id === me.id || norm(p.name) === norm(me.name)));
          if (there) found[o.id] = there.id;
        }
      } catch {
        /* offline: skip it */
      }
    }),
  );
  return { bills: [...out.values()], picks: found };
}

/**
 * "What I owe": everything this phone's owner still owes across the bills
 * friends shared with them, grouped by who they pay.
 */
export function WhatIOwe() {
  const [bills, setBills] = useState<LoadedBill[] | null>(null);
  const [name, setName] = useState<string | null>(getIam);
  const [choosing, setChoosing] = useState(false);
  const [picks] = useState(getPicks);
  const [paying, setPaying] = useState<string | null>(null);
  // Bumped after a slip is accepted, to reload everything.
  const [version, setVersion] = useState(0);
  const [stale, setStale] = useState(false);
  // The same organisers' other bills with me in them.
  const [others, setOthers] = useState<{ bills: LoadedBill[]; picks: Record<string, string> }>({ bills: [], picks: {} });

  useEffect(() => {
    let cancelled = false;
    loadSeenBills().then((b) => !cancelled && setBills(b));
    return () => {
      cancelled = true;
    };
  }, [version]);

  useEffect(() => {
    if (!bills) return;
    let cancelled = false;
    loadOtherBills(bills, name, picks).then((o) => !cancelled && setOthers(o));
    return () => {
      cancelled = true;
    };
  }, [bills, name, picks]);

  // "Who are you?": everyone who still owes something, in these bills and in
  // the same organisers' other bills (people who've paid don't show).
  const [unpaid, setUnpaid] = useState<Look[] | null>(null);
  useEffect(() => {
    if (!bills) return;
    let cancelled = false;
    Promise.all(
      bills.map((b) =>
        fetch(`/api/splits/${b.id}/people`, { cache: "no-store" })
          .then((r) => (r.ok ? (r.json() as Promise<{ people: Look[] }>) : { people: [] }))
          .catch(() => ({ people: [] as Look[] })),
      ),
    ).then((all) => {
      if (cancelled) return;
      const byName = new Map<string, Look>();
      for (const p of [...unpaidPeople(bills), ...all.flatMap((a) => a.people)]) if (!byName.has(norm(p.name))) byName.set(norm(p.name), p);
      setUnpaid([...byName.values()].sort((a, c) => a.name.localeCompare(c.name, ["th", "en"], { sensitivity: "base" })));
    });
    return () => {
      cancelled = true;
    };
  }, [bills]);

  if (bills === null) return <p className="px-1 text-ink-2">Loading your bills…</p>;
  if (bills.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
          <ReceiptText size={28} {...ICON} aria-hidden />
        </div>
        <p className="text-ink-2">Bills friends send you show up here once you open their links on this phone.</p>
        <p className="mt-2 text-[13px] text-ink-2">
          Opened it in LINE? LINE&apos;s browser and Safari keep separate lists, so open this page in the same one.
        </p>
      </div>
    );
  }

  const groups = whatIOwe([...bills, ...others.bills], name, { ...others.picks, ...picks });
  const known = !!name || Object.keys(picks).some((id) => bills.some((b) => b.id === id));
  const people = namesIn(bills);
  const choosable = unpaid ?? unpaidPeople(bills);

  if (!known || choosing) {
    return (
      <Section title="Who are you in these bills?">
        <ul className="card rows overflow-hidden">
          {choosable.map((p) => (
            <li key={p.name}>
              <button
                type="button"
                className="flex min-h-[56px] w-full items-center gap-3 px-5 text-left"
                onClick={() => {
                  setIam(p.name);
                  setName(p.name);
                  setChoosing(false);
                }}
              >
                <Avatar person={p} size={36} />
                <span className="truncate font-semibold">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {choosable.length === 0 && <p className="card p-5 text-center text-ink-2">Everyone in these bills has paid.</p>}
        <p className="px-5 text-[13px] text-ink-2">
          Everyone who still owes in these friends&apos; bills. Pick your name once; bills with that name count as yours.
        </p>
      </Section>
    );
  }

  const totals = new Map<string, number>();
  for (const g of groups) totals.set(g.currency, (totals.get(g.currency) ?? 0) + g.total);
  const count = groups.reduce((s, g) => s + g.lines.length, 0);

  return (
    <div className="space-y-6">
      {name && (
        <p className="-mt-2 flex items-center gap-2 px-1 text-[15px] text-ink-2">
          <Avatar person={people.find((p) => p.name === name) ?? { name }} size={26} /> You&apos;re{" "}
          <b className="text-ink">{name}</b> in these bills ·
          <button type="button" className="font-semibold text-accent" onClick={() => setChoosing(true)}>
            Change
          </button>
        </p>
      )}

      <div className="card px-6 py-5 text-center">
        {count === 0 ? (
          <p className="flex items-center justify-center gap-2 py-3 text-[17px] font-semibold">
            <PartyPopper size={22} {...ICON} className="text-accent" aria-hidden /> You&apos;re all paid up
          </p>
        ) : (
          <>
            <p className="text-[15px] text-ink-2">Left to pay</p>
            {[...totals].map(([currency, v]) => (
              <Money key={currency} value={v} currency={currency} className="mt-1 block text-[44px] leading-none font-bold tracking-tight" />
            ))}
            <p className="mt-2 text-[15px] text-ink-2">
              {count} {count === 1 ? "bill" : "bills"} · {groups.length} {groups.length === 1 ? "person" : "people"}
            </p>
          </>
        )}
      </div>

      {/* Paid already? One slip pays everything owed to that person, oldest bill first. */}
      <SlipCard<SlipResult>
        choices={groups.map((g) => ({
          ref: JSON.stringify(g.lines.map((l) => ({ id: l.billId, ref: l.ref }))),
          person: g.to,
          label: `To ${g.to.name}`,
          detail: <Money value={g.total} currency={g.currency} />,
        }))}
        endpoint="/api/slips"
        field="items"
        pickTitle="Who did you pay?"
        currency={groups[0]?.currency ?? "THB"}
        onAccepted={() => setStale(true)}
        onClose={() => {
          if (stale) {
            setStale(false);
            setVersion((v) => v + 1);
          }
        }}
      />

      {groups.map((g) => (
        <Section
          key={`${g.to.name}|${g.currency}`}
          title={
            <span className="flex items-center gap-2">
              <Avatar person={g.to} size={22} /> To {g.to.name} · <Money value={g.total} currency={g.currency} />
            </span>
          }
          action={
            <button type="button" className="chip-accent min-h-9 px-4" onClick={() => setPaying(`${g.to.name}|${g.currency}`)}>
              Pay
            </button>
          }
        >
          <ul className="card rows overflow-hidden">
            {g.lines.map((l) => (
              <li key={`${l.billId}|${l.to.name}`}>
                <Link href={l.href} className="flex min-h-[60px] items-center gap-3 py-2 pr-3 pl-4">
                  <PaidMark status={l.part ? "part" : "none"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{l.title}</span>
                    <span className="block text-[13px] text-ink-2">
                      {l.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {l.part && <span className="font-semibold text-accent"> · Part paid</span>}
                    </span>
                  </span>
                  <span className="text-right leading-tight">
                    {l.part && <span className="block text-[11px] text-ink-2">left to pay</span>}
                    <Money value={l.left} currency={l.currency} className="text-[17px] font-bold tracking-tight" />
                  </span>
                  <ChevronRight size={20} {...ICON} className="shrink-0 text-ink-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ))}

      <p className="px-5 text-[13px] text-ink-2">
        Every bill these friends made with you in it, also ones they didn&apos;t send you. Tap Pay to pay someone everything at
        once, or a bill to pay just that one.
      </p>

      <PayGroupSheet
        group={groups.find((g) => `${g.to.name}|${g.currency}` === paying) ?? null}
        onClose={() => {
          setPaying(null);
          // Reload once the sheet is closed, so its success message stays put.
          if (stale) {
            setStale(false);
            setVersion((v) => v + 1);
          }
        }}
        onPaid={() => setStale(true)}
      />
    </div>
  );
}
