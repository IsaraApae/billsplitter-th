"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { formatMoney } from "@/lib/money";
import { ICON, Money, MoneyInput, Sheet, cx } from "./ui";

/** What the organiser records for one person. */
export type PaymentInput = { paid: true } | { paid: false } | { amount: number };

export type PaidStatus = "full" | "part" | "none";

/** The big tick (paid in full), the small tick (paid part), or an empty circle. */
export function PaidMark({ status, busy, small }: { status: PaidStatus; busy?: boolean; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "grid shrink-0 place-items-center rounded-full",
        small ? "size-5" : "size-8",
        status === "full" && "bg-accent text-accent-ink",
        status === "part" && "bg-accent-soft text-accent shadow-[inset_0_0_0_2px_var(--accent)]",
        status === "none" && "bg-[var(--field)]",
        busy && "opacity-50",
      )}
    >
      {status === "full" && <Check size={small ? 12 : 18} {...ICON} />}
      {status === "part" && <Check size={small ? 9 : 12} strokeWidth={3} />}
    </span>
  );
}

/**
 * Organiser's sheet for one person: paid in full, paid part of it (with the
 * amount), or not paid yet. `owed` is what they're asked to pay in total.
 */
export function PaymentSheet({
  open,
  onClose,
  name,
  owed,
  currency,
  status,
  paidSoFar,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  owed: number;
  currency: string;
  status: PaidStatus;
  paidSoFar: number;
  onSave: (p: PaymentInput) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`Has ${name} paid?`} subtitle={`Asked to pay ${formatMoney(owed, currency)}`}>
      {/* Re-mounts on open so the amount starts from what's recorded. */}
      {open && (
        <PaymentForm
          owed={owed}
          currency={currency}
          status={status}
          paidSoFar={paidSoFar}
          onSave={(p) => {
            onSave(p);
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}

function PaymentForm({
  owed,
  currency,
  status,
  paidSoFar,
  onSave,
}: {
  owed: number;
  currency: string;
  status: PaidStatus;
  paidSoFar: number;
  onSave: (p: PaymentInput) => void;
}) {
  const [amount, setAmount] = useState(status === "part" ? paidSoFar : 0);
  const partOk = amount > 0 && amount < owed;

  return (
    <div className="space-y-3.5">
      <button type="button" className="btn-primary h-13 w-full" onClick={() => onSave({ paid: true })}>
        <Check size={22} {...ICON} aria-hidden /> Paid <Money value={owed} currency={currency} /> in full
      </button>

      <div className="card space-y-3 p-5">
        <p className="font-semibold">Paid part of it</p>
        <div className="flex items-center gap-2.5">
          <MoneyInput className="flex-1" ariaLabel="Amount paid so far" currency={currency} value={amount} onChange={setAmount} />
          <button
            type="button"
            className="btn-secondary h-12 shrink-0 px-5"
            disabled={!partOk}
            onClick={() => onSave({ amount })}
          >
            Save
          </button>
        </div>
        <p className="text-[13px] text-ink-2">
          {amount >= owed && amount > 0 ? (
            "That's everything — use “Paid in full”."
          ) : partOk ? (
            <>
              <Money value={owed - amount} currency={currency} /> still to pay
            </>
          ) : (
            "How much they've paid you so far."
          )}
        </p>
      </div>

      {status !== "none" && (
        <button type="button" className="btn-secondary h-12 w-full" onClick={() => onSave({ paid: false })}>
          Not paid yet
        </button>
      )}
    </div>
  );
}
