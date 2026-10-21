"use client";

import { ChevronRight, PartyPopper, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getEditToken, getIam, getPicks, getSeen, setIam } from "@/lib/client/storage";
import { namesIn, whatIOwe, type LoadedBill } from "@/lib/owed";
import type { SplitDoc } from "@/lib/types";
import { PaidMark } from "./Payments";
import { Avatar, ICON, Money, Section } from "./ui";

type BillData = { doc: SplitDoc; paid: string[]; partial?: Record<string, number> };

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

/**
 * "What I owe": everything this phone's owner still owes across the bills
 * friends shared with them, grouped by who they pay.
 */
export function WhatIOwe() {
  const [bills, setBills] = useState<LoadedBill[] | null>(null);
  const [name, setName] = useState<string | null>(getIam);
  const [choosing, setChoosing] = useState(false);
  const [picks] = useState(getPicks);

  useEffect(() => {
    let cancelled = false;
    loadSeenBills().then((b) => !cancelled && setBills(b));
    return () => {
      cancelled = true;
    };
  }, []);

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

  const groups = whatIOwe(bills, name, picks);
  const known = !!name || Object.keys(picks).some((id) => bills.some((b) => b.id === id));
  const people = namesIn(bills);

  if (!known || choosing) {
    return (
      <Section title="Who are you in these bills?">
        <ul className="card rows overflow-hidden">
          {people.map((p) => (
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
        <p className="px-5 text-[13px] text-ink-2">Pick your name once; bills with that name count as yours.</p>
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

      {groups.map((g) => (
        <Section
          key={`${g.to.name}|${g.currency}`}
          title={
            <span className="flex items-center gap-2">
              <Avatar person={g.to} size={22} /> To {g.to.name} · <Money value={g.total} currency={g.currency} />
            </span>
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

      <p className="px-5 text-[13px] text-ink-2">Bills you&apos;ve opened on this phone. Tap one to pay it.</p>
    </div>
  );
}
