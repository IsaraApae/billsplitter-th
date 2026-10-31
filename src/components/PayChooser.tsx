"use client";

import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { PayQr, type PayQrSource } from "./PayQr";
import { SlipUpload, type SlipResult } from "./SlipUpload";
import { Callout, ICON, Money, cx } from "./ui";

export interface PayBill {
  /** split id */
  id: string;
  /** what the bill records the payment under */
  ref: string;
  title: string;
  left: number;
}

const keyOf = (b: PayBill) => `${b.id}|${b.ref}`;

/**
 * Inside a Pay sheet: tick which bills to pay (all of them to start with),
 * then one QR for the ticked total and one slip spread over the ticked bills,
 * oldest first. Mount it fresh each time the sheet opens.
 */
export function PayChooser({
  bills,
  currency,
  source,
  qrName,
  noQr,
  onPaid,
}: {
  bills: PayBill[];
  currency: string;
  source: PayQrSource | null;
  /** under the QR, e.g. "Mint → Isara" */
  qrName: string;
  /** shown instead of a QR when there isn't one, given the amount */
  noQr: (amount: ReactNode) => ReactNode;
  onPaid: (r: SlipResult) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(bills.map(keyOf)));
  const chosen = bills.filter((b) => picked.has(keyOf(b)));
  const total = chosen.reduce((s, b) => s + b.left, 0);
  const all = chosen.length === bills.length;
  const toggle = (k: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[15px] font-semibold">Which bills?</span>
          <button
            type="button"
            className="text-[15px] font-semibold text-accent"
            onClick={() => setPicked(all ? new Set() : new Set(bills.map(keyOf)))}
          >
            {all ? "Clear" : "Pay all"}
          </button>
        </div>
        <ul className="card rows overflow-hidden text-[15px]" role="group" aria-label="Bills to pay">
          {bills.map((b) => {
            const on = picked.has(keyOf(b));
            return (
              <li key={keyOf(b)}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className="flex min-h-[52px] w-full items-center gap-3 py-2 pr-5 pl-4 text-left"
                  onClick={() => toggle(keyOf(b))}
                >
                  <span
                    aria-hidden
                    className={cx(
                      "grid size-7 shrink-0 place-items-center rounded-full",
                      on ? "bg-accent-fill text-accent-ink" : "border-2 border-[var(--line)]",
                    )}
                  >
                    {on && <Check size={16} {...ICON} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{b.title}</span>
                  <Money value={b.left} currency={currency} className={on ? "font-semibold" : "text-ink-2"} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {chosen.length === 0 ? (
        <Callout tone="info">Tick the bills you want to pay.</Callout>
      ) : (
        <>
          {source ? (
            <PayQr key={total} source={source} amount={total} name={qrName} />
          ) : (
            <Callout tone="info">{noQr(<Money value={total} currency={currency} />)}</Callout>
          )}
          <SlipUpload<SlipResult>
            key={[...picked].sort().join(",")}
            endpoint="/api/slips"
            field="items"
            personRef={JSON.stringify(chosen.map((b) => ({ id: b.id, ref: b.ref })))}
            currency={currency}
            onAccepted={onPaid}
          />
          <p className="px-1 text-[13px] text-ink-2">
            {chosen.length === 1 ? "The slip pays this bill." : `One slip for ${chosen.length} bills pays them oldest first.`}
          </p>
        </>
      )}
    </div>
  );
}
