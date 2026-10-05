"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ORGANISER_ID, type PersonResult } from "@/lib/calc";
import type { Person, SplitMode } from "@/lib/types";
import { Avatar, ICON, Money, cx } from "./ui";

/** One person as a row inside a list card (wrap rows in `<ul className="card rows">`). */
export function PersonCard({
  person,
  profile,
  currency,
  mode,
  highlight,
  leading,
  badge,
  action,
  defaultOpen = false,
}: {
  person: PersonResult;
  profile?: Pick<Person, "name" | "emoji" | "color">;
  currency: string;
  mode: SplitMode;
  highlight?: "unpaid" | "paid";
  leading?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // What they owe before rounding: their share less anything they paid upfront.
  const exact = person.total - person.prepaid;
  return (
    <li className={cx(highlight === "paid" && "opacity-70")}>
      <div className="flex min-h-[60px] items-center gap-2 py-2 pr-3 pl-4">
        {leading}
        <button
          type="button"
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Avatar person={profile ?? { name: person.name }} size={36} />
          <span className="min-w-0 flex-1">
            <span className={cx("block truncate font-semibold", highlight === "paid" && "line-through decoration-ink-3")}>
              {person.name}
            </span>
            {badge}
          </span>
          {person.payable < 0 ? (
            // Paid more than their share upfront: the organiser pays them back.
            <span className="text-right leading-tight">
              <span className="block text-[11px] text-ink-2">gets back</span>
              <Money value={-person.payable} currency={currency} className="text-[19px] font-bold tracking-tight text-positive" />
            </span>
          ) : (
            <Money value={person.payable} currency={currency} className="text-[19px] font-bold tracking-tight" />
          )}
          {!action && <ChevronDown size={20} {...ICON} aria-hidden className={cx("shrink-0 text-ink-3", open && "rotate-180")} />}
        </button>
        {action}
      </div>
      {open && (
        <div className="px-5 pb-4 text-[15px]">
          {mode === "itemized" ? (
            <ul className="space-y-1.5">
              {person.items.map((it) => (
                <li key={it.itemId} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {it.name}
                    {it.totalShares !== it.sharedBy ? (
                      <span className="text-ink-2">
                        {" "}
                        {it.shares}/{it.totalShares}
                      </span>
                    ) : (
                      it.sharedBy > 1 && <span className="text-ink-2"> ÷{it.sharedBy}</span>
                    )}
                  </span>
                  <Money value={it.amount} currency={currency} tone={it.amount < 0 ? "negative" : undefined} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-2">Equal share of the whole bill ({person.items.length} items).</p>
          )}
          <dl className="mt-3 space-y-1 border-t border-dashed border-[var(--line)] pt-3 text-ink-2">
            <Row k="Items" v={<Money value={person.subtotal} currency={currency} />} />
            {person.discount > 0 && <Row k="Discount" v={<Money value={person.discount} currency={currency} tone="negative" />} />}
            {person.service > 0 && <Row k="Service charge" v={<Money value={person.service} currency={currency} />} />}
            {person.vat > 0 && <Row k="VAT" v={<Money value={person.vat} currency={currency} />} />}
            {person.prepaid > 0 && (
              <>
                <Row k="Share" v={<Money value={person.total} currency={currency} />} />
                <Row k="Paid upfront" v={<Money value={person.prepaid} currency={currency} tone="negative" />} />
              </>
            )}
            {person.payable !== person.total - person.prepaid ? (
              <>
                <Row k="Exact amount" v={<Money value={exact} currency={currency} />} />
                <Row
                  k={person.payable > exact ? "Rounded up" : "Rounded down"}
                  v={
                    person.payable > exact ? (
                      <>
                        +<Money value={person.payable - exact} currency={currency} />
                      </>
                    ) : (
                      <Money value={exact - person.payable} currency={currency} tone="negative" />
                    )
                  }
                />
                <FinalRow person={person} currency={currency} />
              </>
            ) : person.prepaid > 0 ? (
              <FinalRow person={person} currency={currency} />
            ) : (
              <Row k="Total" v={<Money value={person.total} currency={currency} />} strong />
            )}
          </dl>
        </div>
      )}
    </li>
  );
}

/** The last line: what they pay (or get back), or the organiser's own share. */
function FinalRow({ person, currency }: { person: PersonResult; currency: string }) {
  const k = person.personId === ORGANISER_ID ? "Your share" : person.payable < 0 ? "Gets back" : "To pay";
  return <Row k={k} v={<Money value={Math.abs(person.payable)} currency={currency} />} strong />;
}

function Row({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <div className={cx("flex justify-between", strong && "font-semibold text-ink")}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
