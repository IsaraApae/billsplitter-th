"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Person, PaymentInfo } from "@/lib/types";
import { PaidMark } from "./Payments";
import { PayChooser } from "./PayChooser";
import { organiserQr, usePrefetchQr } from "./PayQr";
import { SlipCard } from "./SlipCard";
import { type SlipResult } from "./SlipUpload";
import { dayCount } from "@/lib/owed";
import { Avatar, ICON, Money, Sheet, cx } from "./ui";
import { langOf } from "@/lib/lang";

type Look = Pick<Person, "name" | "emoji" | "color">;

export interface BoardViewPerson {
  key: string;
  look: Look;
  total: number;
  /** `days`: whole days since the bill */
  bills: { id: string; title: string; date: string; days: number; left: number; part: boolean; ref: string }[];
}

/** "16 days ago", amber after a week. */
function Waiting({ days, className }: { days: number; className?: string }) {
  return <span className={cx(className, "whitespace-nowrap", days >= 7 && "font-semibold text-warn")}>{days === 0 ? "today" : `${dayCount(days)} ago`}</span>;
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
  usePrefetchQr(source?.mode === "generate");

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

      {people.map((p) => {
        const oldest = Math.max(...p.bills.map((b) => b.days));
        return (
          <section key={p.key} className="space-y-2" aria-label={p.look.name}>
            <div className="flex items-center gap-3 px-2">
              <Avatar person={p.look} size={32} />
              <span className="min-w-0 flex-1">
                <h2 className="truncate text-[19px] leading-tight font-bold">{p.look.name}</h2>
                <span className={cx("block text-[13px]", oldest >= 7 ? "font-semibold text-warn" : "text-ink-2")}>
                  {oldest === 0 ? "Unpaid since today" : `Unpaid for ${dayCount(oldest)}`}
                </span>
              </span>
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
                      <span className="block truncate font-semibold" {...langOf(bill.title)}>{bill.title}</span>
                      <span className="block truncate text-[13px] text-ink-2">
                        {new Date(bill.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        {" · "}
                        <Waiting days={bill.days} />
                        {bill.part && <span className="font-semibold text-accent"> · Part paid</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-right leading-tight whitespace-nowrap">
                      {bill.part && <span className="block text-[11px] text-ink-2">left to pay</span>}
                      <Money value={bill.left} currency={currency} className="text-[17px] font-bold tracking-tight" />
                    </span>
                    <ChevronRight size={20} {...ICON} className="shrink-0 text-ink-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <Sheet
        open={!!payPerson}
        onClose={() => {
          setPaying(null);
          refreshIfPaid();
        }}
        title={payPerson ? `${payPerson.look.name} pays ${organiser}` : "Pay"}
      >
        {payPerson && (
          <PayChooser
            key={payPerson.key}
            bills={payPerson.bills.map((b) => ({ id: b.id, ref: b.ref, title: b.title, left: b.left }))}
            currency={currency}
            source={source}
            qrName={`${payPerson.look.name} → ${organiser}`}
            noQr={(amount) => (
              <>
                Send {amount} to {organiser}
                {payment?.note ? <> — {payment.note}</> : null}.
              </>
            )}
            onPaid={() => setStale(true)}
          />
        )}
      </Sheet>
    </>
  );
}
