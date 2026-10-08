"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { photoSrc } from "@/lib/client/photo";
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
        status === "part" && "bg-[var(--field)] text-accent",
        status === "none" && "bg-[var(--field)]",
        busy && "opacity-50",
      )}
    >
      {status === "full" && <Check size={small ? 12 : 18} {...ICON} />}
      {status === "part" && <Check size={small ? 10 : 14} strokeWidth={3} />}
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
  slips = [],
  title,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  /** defaults to "Has <name> paid?" */
  title?: string;
  owed: number;
  currency: string;
  status: PaidStatus;
  paidSoFar: number;
  /** slips this person uploaded (organiser only) */
  slips?: SlipInfo[];
  onSave: (p: PaymentInput) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title ?? `Has ${name} paid?`} subtitle={`Asked to pay ${formatMoney(owed, currency)}`}>
      {/* Re-mounts on open so the amount starts from what's recorded. */}
      {open && slips.length > 0 && <SlipList slips={slips} currency={currency} />}
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
  const [hint, setHint] = useState<string | null>(null);
  const half = Math.round(owed / 2);

  // Paying the whole amount (or more) is the big tick, not a part.
  function savePart() {
    if (amount <= 0) {
      setHint("Type how much they've paid you so far.");
      return;
    }
    onSave(amount >= owed ? { paid: true } : { amount });
  }

  return (
    <div className="space-y-3.5">
      <button type="button" className="btn-primary h-13 w-full" onClick={() => onSave({ paid: true })}>
        <Check size={22} {...ICON} aria-hidden /> Paid <Money value={owed} currency={currency} /> in full
      </button>

      <form
        className="card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          savePart();
        }}
      >
        <p className="font-semibold">Paid part of it</p>
        <div className="flex items-center gap-2.5">
          <MoneyInput
            className="flex-1"
            ariaLabel="Amount paid so far"
            currency={currency}
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setHint(null);
            }}
          />
          <button type="submit" className="btn-secondary h-12 shrink-0 px-5">
            Save
          </button>
        </div>
        {owed > 1 && (
          <button type="button" className="chip" onClick={() => setAmount(half)}>
            Half · <Money value={half} currency={currency} />
          </button>
        )}
        <p className={cx("text-[13px]", hint ? "font-semibold text-ink" : "text-ink-2")} aria-live="polite">
          {hint ??
            (amount >= owed && amount > 0 ? (
              "That's everything — saving gives the big tick."
            ) : amount > 0 ? (
              <>
                <Money value={owed - amount} currency={currency} /> still to pay
              </>
            ) : (
              "How much they've paid you so far."
            ))}
        </p>
      </form>

      {status !== "none" && (
        <button type="button" className="btn-secondary h-12 w-full" onClick={() => onSave({ paid: false })}>
          Not paid yet
        </button>
      )}
    </div>
  );
}

/** A slip a friend uploaded, as the organiser sees it. */
export interface SlipInfo {
  photo: string;
  amount: number;
  date: string;
  receiver: "match" | "unknown";
  senderName: string | null;
}

function SlipList({ slips, currency }: { slips: SlipInfo[]; currency: string }) {
  return (
    <div className="mb-3.5 space-y-2">
      <p className="px-5 text-[13px] text-ink-2">Slips they uploaded</p>
      <ul className="card rows overflow-hidden">
        {slips.map((s, i) => (
          <li key={i}>
            <a
              href={s.photo ? photoSrc(s.photo) : undefined}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[64px] items-center gap-3 py-2 pr-4 pl-3"
            >
              {s.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoSrc(s.photo)} alt="Slip" className="size-12 shrink-0 rounded-[12px] bg-white object-cover" />
              ) : (
                <span className="size-12 shrink-0 rounded-[12px] bg-[var(--field)]" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  <Money value={s.amount} currency={currency} /> · {s.date}
                </span>
                <span className="block truncate text-[13px] text-ink-2">
                  {s.receiver === "match" ? "Receiver's PromptPay matches ✓" : "Receiver not checked"}
                  {s.senderName ? ` · from ${s.senderName}` : ""}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
