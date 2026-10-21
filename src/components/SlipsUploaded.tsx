"use client";

import { ReceiptText, ShieldCheck } from "lucide-react";
import { photoSrc } from "@/lib/client/photo";
import { parseTransferKey } from "@/lib/settle";
import type { Person, SplitDoc } from "@/lib/types";
import type { SlipInfo } from "./Payments";
import { Avatar, ICON, Money, Section } from "./ui";

/** " · Slip" after a person's status: they uploaded a slip (organiser only). */
export function SlipTag() {
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-1.5 align-middle text-[12px] font-semibold text-accent-strong">
      <ReceiptText size={12} {...ICON} aria-hidden /> Slip
    </span>
  );
}

export interface SlipRow {
  s: SlipInfo;
  /** who sent it */
  person: Pick<Person, "name" | "emoji" | "color">;
  /** which bill it was for (on a big bill) */
  bill?: string;
}

/** The person id a slip was recorded under (a person id, or the sender of a transfer). */
export const slipPersonId = (key: string) => parseTransferKey(key)?.from ?? key;

/** One bill's slips as rows, with who sent each. */
export function slipRows(slips: Record<string, SlipInfo[]>, doc: SplitDoc, bill?: string): SlipRow[] {
  return Object.entries(slips).flatMap(([key, list]) => {
    const person = doc.people.find((p) => p.id === slipPersonId(key)) ?? { name: "Someone" };
    return list.map((s) => ({ s, person, bill }));
  });
}

/**
 * Every slip uploaded, newest first, each with who sent it (their avatar and
 * name), the bill it was for on a big bill, and the name printed on the slip,
 * so they're easy to tell apart. Organiser only: slips show bank names.
 */
export function SlipsUploaded({ rows: unsorted, currency }: { rows: SlipRow[]; currency: string }) {
  const rows = [...unsorted].sort((a, b) => (b.s.at ?? "").localeCompare(a.s.at ?? ""));
  if (rows.length === 0) return null;
  return (
    <Section title={`Slips uploaded · ${rows.length}`}>
      <ul className="card rows overflow-hidden">
        {rows.map(({ s, person, bill }, i) => (
          <li key={i}>
            <a
              href={s.photo ? photoSrc(s.photo) : undefined}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[72px] items-center gap-3 py-2 pr-3 pl-4"
              aria-label={`Slip from ${person.name}`}
            >
              <Avatar person={person} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{person.name}</span>
                <span className="block text-[15px]">
                  <Money value={s.amount} currency={currency} className="font-semibold" />
                  <span className="text-ink-2">
                    {" "}
                    · {new Date(`${s.date}T12:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {bill && <> · {bill}</>}
                  </span>
                </span>
                <span className="flex items-center gap-1 truncate text-[13px] text-ink-2">
                  {s.receiver === "match" && <ShieldCheck size={14} {...ICON} className="shrink-0 text-accent" aria-hidden />}
                  <span className="truncate">{s.senderName ? `From "${s.senderName}"` : "Sender name not readable"}</span>
                </span>
              </span>
              {s.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoSrc(s.photo)} alt="" className="h-16 w-12 shrink-0 rounded-[10px] border border-[var(--line)] bg-white object-cover object-top" />
              ) : (
                <span className="h-16 w-12 shrink-0 rounded-[10px] bg-[var(--field)]" />
              )}
            </a>
          </li>
        ))}
      </ul>
      <p className="px-5 text-[13px] text-ink-2">Tap a slip to see the picture. Only you see these.</p>
    </Section>
  );
}
