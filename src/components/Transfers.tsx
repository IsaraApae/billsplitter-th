"use client";

import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { ORGANISER_ID, type PersonResult } from "@/lib/calc";
import type { Person } from "@/lib/types";
import { Avatar, ICON, Money, cx } from "./ui";

/**
 * When friends pay each payer directly, a person's row shows their share of
 * the bill (what they pay or are paid back is in "Who pays whom").
 */
export const asShare = (p: PersonResult): PersonResult => ({ ...p, prepaid: 0, payable: p.total });

/** One "A → B ฿X" row inside a list card (wrap rows in `<ul className="card rows">`). */
export function TransferRow({
  from,
  to,
  amount,
  currency,
  you = false,
  leading,
  action,
  status,
  done = false,
}: {
  from: Pick<Person, "id" | "name" | "emoji" | "color">;
  to: Pick<Person, "id" | "name" | "emoji" | "color">;
  amount: number;
  currency: string;
  /** say "You" for the organiser (in the wizard) */
  you?: boolean;
  leading?: ReactNode;
  action?: ReactNode;
  /** small line under the names, e.g. "Paid" / "Left to pay ฿50" */
  status?: ReactNode;
  done?: boolean;
}) {
  const name = (p: Pick<Person, "id" | "name">) => (you && p.id === ORGANISER_ID ? "You" : p.name);
  return (
    <li className={cx("flex min-h-[60px] items-center gap-2 py-2 pr-3", leading ? "pl-4" : "pl-5", done && "opacity-70")}>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar person={from} size={28} />
          <span className={cx("min-w-0 truncate font-semibold", done && "line-through decoration-ink-3")}>{name(from)}</span>
          <ArrowRight size={16} {...ICON} className="shrink-0 text-ink-3" aria-label="pays" />
          <Avatar person={to} size={28} />
          <span className="min-w-0 truncate font-semibold">{name(to)}</span>
        </span>
        {status}
      </span>
      <Money value={amount} currency={currency} className="text-[17px] font-bold tracking-tight" />
      {action}
    </li>
  );
}
