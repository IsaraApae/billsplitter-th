"use client";

import { useState, type ReactNode } from "react";
import type { PersonResult } from "@/lib/calc";
import { formatMoney } from "@/lib/money";
import type { SplitMode } from "@/lib/types";
import { cx } from "./ui";

export function PersonCard({
  person,
  currency,
  mode,
  highlight,
  leading,
  badge,
  footer,
  defaultOpen = false,
}: {
  person: PersonResult;
  currency: string;
  mode: SplitMode;
  highlight?: "unpaid" | "paid";
  leading?: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const f = (n: number) => formatMoney(n, currency);
  return (
    <li
      className={cx(
        "card overflow-hidden",
        highlight === "unpaid" && "border-l-4 border-l-amber-500 dark:border-l-amber-500",
        highlight === "paid" && "opacity-75",
      )}
    >
      <div className="flex items-center gap-3 p-3">
        {leading}
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="min-w-0 flex-1">
            <span className={cx("block truncate font-semibold", highlight === "paid" && "line-through decoration-zinc-400")}>
              {person.name}
            </span>
            {badge}
          </span>
          <span className="text-lg font-bold tabular-nums">{f(person.total)}</span>
          <span aria-hidden className={cx("text-zinc-400 transition", open && "rotate-180")}>
            ▾
          </span>
        </button>
      </div>
      {open && (
        <div className="border-t border-zinc-100 px-4 py-3 text-sm dark:border-zinc-800">
          {mode === "itemized" ? (
            <ul className="space-y-1">
              {person.items.map((it) => (
                <li key={it.itemId} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {it.name}
                    {it.sharedBy > 1 && <span className="text-zinc-500"> ÷{it.sharedBy}</span>}
                  </span>
                  <span className="tabular-nums">{f(it.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-zinc-500">Equal share of the whole bill ({person.items.length} items).</p>
          )}
          <dl className="mt-2 space-y-0.5 border-t border-dashed border-zinc-200 pt-2 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            <Row k="Items" v={f(person.subtotal)} />
            {person.discount > 0 && <Row k="Discount" v={`−${f(person.discount)}`} />}
            {person.service > 0 && <Row k="Service charge" v={f(person.service)} />}
            {person.vat > 0 && <Row k="VAT" v={f(person.vat)} />}
            <Row k="Total" v={f(person.total)} strong />
          </dl>
          {footer}
        </div>
      )}
    </li>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={cx("flex justify-between", strong && "font-semibold text-zinc-900 dark:text-zinc-100")}>
      <dt>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
