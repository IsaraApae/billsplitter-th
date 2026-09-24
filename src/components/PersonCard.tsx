"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { PersonResult } from "@/lib/calc";
import type { Person, SplitMode } from "@/lib/types";
import { Avatar, Money, cx } from "./ui";

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
  return (
    <li
      className={cx(
        "card overflow-hidden transition-opacity duration-300",
        highlight === "unpaid" && "shadow-[inset_4px_0_0_var(--warn)]",
        highlight === "paid" && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2 p-2.5 pl-3">
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
          <Money value={person.payable} currency={currency} className="text-[19px] font-bold tracking-tight" />
          {!action && (
            <ChevronDown
              size={18}
              aria-hidden
              className={cx("shrink-0 text-ink-3 transition-transform duration-300", open && "rotate-180")}
            />
          )}
        </button>
        {action}
      </div>
      {open && (
        <div className="border-t border-line px-4 py-3 text-[14px]">
          {mode === "itemized" ? (
            <ul className="space-y-1.5">
              {person.items.map((it) => (
                <li key={it.itemId} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {it.name}
                    {it.sharedBy > 1 && <span className="text-ink-2"> ÷{it.sharedBy}</span>}
                  </span>
                  <Money value={it.amount} currency={currency} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-2">Equal share of the whole bill ({person.items.length} items).</p>
          )}
          <dl className="mt-2.5 space-y-1 border-t border-dashed border-line pt-2.5 text-ink-2">
            <Row k="Items" v={<Money value={person.subtotal} currency={currency} />} />
            {person.discount > 0 && <Row k="Discount" v={<>−<Money value={person.discount} currency={currency} /></>} />}
            {person.service > 0 && <Row k="Service charge" v={<Money value={person.service} currency={currency} />} />}
            {person.vat > 0 && <Row k="VAT" v={<Money value={person.vat} currency={currency} />} />}
            {person.payable !== person.total ? (
              <>
                <Row k="Exact share" v={<Money value={person.total} currency={currency} />} />
                <Row k="Rounded up" v={<>+<Money value={person.payable - person.total} currency={currency} /></>} />
                <Row k="To pay" v={<Money value={person.payable} currency={currency} />} strong />
              </>
            ) : (
              <Row k="Total" v={<Money value={person.total} currency={currency} />} strong />
            )}
          </dl>
        </div>
      )}
    </li>
  );
}

function Row({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <div className={cx("flex justify-between", strong && "font-semibold text-ink")}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
