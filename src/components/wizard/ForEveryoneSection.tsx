"use client";

import { Users } from "lucide-react";
import type { CalcResult } from "@/lib/calc";
import type { SplitDoc } from "@/lib/types";
import { ICON, Money, MoneyInput, Section } from "../ui";
import type { SetDoc } from "./Wizard";

/**
 * "Paid for everyone": a deposit, voucher or gift card paid before, taken off
 * the whole bill after service and VAT, so everyone pays less, the organiser too.
 */
export function ForEveryoneSection({ doc, setDoc, calc }: { doc: SplitDoc; setDoc: SetDoc; calc: CalcResult }) {
  if (doc.people.length < 2) return null;
  return (
    <Section title="Paid for everyone">
      <div className="card flex min-h-[64px] items-center gap-3 py-2 pr-4 pl-5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--field)] text-ink-2" aria-hidden>
          <Users size={18} {...ICON} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">Everyone</span>
          <span className="block truncate text-[13px] text-ink-2">you included</span>
        </span>
        <MoneyInput
          className="w-36"
          ariaLabel="Paid for everyone"
          currency={doc.currency}
          value={doc.forEveryone ?? 0}
          onChange={(v) => setDoc((d) => ({ ...d, forEveryone: v > 0 ? v : undefined }))}
        />
      </div>
      <p className="px-5 text-[13px] text-ink-2">
        {calc.forEveryone > 0 ? (
          <>
            Off the whole bill, so everyone pays less. The bill is now <Money value={calc.total} currency={doc.currency} className="text-ink" />.
          </>
        ) : (
          "A deposit, voucher or gift card paid before? It comes off the whole bill, so everyone pays less."
        )}
      </p>
    </Section>
  );
}
