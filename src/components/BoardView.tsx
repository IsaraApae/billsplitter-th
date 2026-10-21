"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Person, PaymentInfo } from "@/lib/types";
import { PaidMark } from "./Payments";
import { organiserQr, PayQr } from "./PayQr";
import { SlipCard } from "./SlipCard";
import { SlipUpload, type SlipResult } from "./SlipUpload";
import { Avatar, Callout, ICON, Money, Sheet } from "./ui";

type Look = Pick<Person, "name" | "emoji" | "color">;

export interface BoardViewPerson {
  key: string;
  look: Look;
  total: number;
  bills: { id: string; title: string; date: string; left: number; part: boolean; ref: string }[];
}

const items = (p: BoardViewPerson) => JSON.stringify(p.bills.map((b) => ({ id: b.id, ref: b.ref })));

/**
 * The people on a "who still owes" list, each with their unpaid bills and a
 * Pay button (one QR for their total, one slip spread over their bills), and
 * "Already paid?" at the top for uploading a slip straight away.
 */
export function BoardView({
  people,
  currency,
  organiser,
  payment,
}: {
  people: BoardViewPerson[];
  currency: string;
  organiser: string;
  payment?: PaymentInfo;
}) {
  const router = useRouter();
  const [paying, setPaying] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const refreshIfPaid = () => {
    if (!stale) return;
    setStale(false);
    router.refresh();
  };
  const payPerson = people.find((p) => p.key === paying);
  const source = organiserQr(payment, currency);

  return (
    <>
      <SlipCard<SlipResult>
        choices={people.map((p) => ({ ref: items(p), person: p.look, label: p.look.name, detail: <Money value={p.total} currency={currency} /> }))}
        endpoint="/api/slips"
        field="items"
        currency={currency}
        onAccepted={() => setStale(true)}
        onClose={refreshIfPaid}
      />

      {people.map((p) => (
        <section key={p.key} className="space-y-2" aria-label={p.look.name}>
          <div className="flex items-center gap-3 px-2">
            <Avatar person={p.look} size={32} />
            <h2 className="min-w-0 flex-1 truncate text-[19px] font-bold">{p.look.name}</h2>
            <Money value={p.total} currency={currency} className="text-[19px] font-bold tracking-tight" />
            <button type="button" className="chip-accent min-h-10 px-4" onClick={() => setPaying(p.key)}>
              Pay
            </button>
          </div>
          <ul className="card rows overflow-hidden">
            {p.bills.map((bill) => (
              <li key={bill.id}>
                <Link href={`/s/${bill.id}`} className="flex min-h-[60px] items-center gap-3 py-2 pr-3 pl-4">
                  <PaidMark status={bill.part ? "part" : "none"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{bill.title}</span>
                    <span className="block text-[13px] text-ink-2">
                      {new Date(bill.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {bill.part && <span className="font-semibold text-accent"> · Part paid</span>}
                    </span>
                  </span>
                  <span className="text-right leading-tight">
                    {bill.part && <span className="block text-[11px] text-ink-2">left to pay</span>}
                    <Money value={bill.left} currency={currency} className="text-[17px] font-bold tracking-tight" />
                  </span>
                  <ChevronRight size={20} {...ICON} className="shrink-0 text-ink-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Sheet
        open={!!payPerson}
        onClose={() => {
          setPaying(null);
          refreshIfPaid();
        }}
        title={payPerson ? `${payPerson.look.name} pays ${organiser}` : "Pay"}
      >
        {payPerson && (
          <div className="space-y-4">
            {source ? (
              <PayQr source={source} amount={payPerson.total} name={`${payPerson.look.name} → ${organiser}`} />
            ) : (
              <Callout tone="info">
                Send <Money value={payPerson.total} currency={currency} /> to {organiser}
                {payment?.note ? <> — {payment.note}</> : null}.
              </Callout>
            )}
            <ul className="card rows overflow-hidden text-[15px]">
              {payPerson.bills.map((b) => (
                <li key={b.id} className="flex min-h-[48px] items-center justify-between gap-3 px-5 py-2">
                  <span className="min-w-0 truncate">{b.title}</span>
                  <Money value={b.left} currency={currency} />
                </li>
              ))}
            </ul>
            <SlipUpload<SlipResult>
              endpoint="/api/slips"
              field="items"
              personRef={items(payPerson)}
              currency={currency}
              onAccepted={() => setStale(true)}
            />
            <p className="px-1 text-[13px] text-ink-2">One slip for the total pays all these bills, oldest first.</p>
          </div>
        )}
      </Sheet>
    </>
  );
}
