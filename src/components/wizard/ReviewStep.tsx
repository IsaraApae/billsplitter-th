"use client";

import type { CalcResult } from "@/lib/calc";
import { formatMoney } from "@/lib/money";
import { isValidPromptPayId } from "@/lib/promptpay";
import type { SplitDoc } from "@/lib/types";
import { Breakdown } from "../Breakdown";
import { PersonCard } from "../PersonCard";
import { Callout, Section } from "../ui";
import type { SetDoc } from "./Wizard";

export function ReviewStep({
  doc,
  setDoc,
  calc,
  goTo,
}: {
  doc: SplitDoc;
  setDoc: SetDoc;
  calc: CalcResult;
  goTo: (step: number) => void;
}) {
  const f = (n: number) => formatMoney(n, doc.currency);
  const pp = doc.payment.promptpay;
  const ppInvalid = pp !== "" && !isValidPromptPayId(pp);
  const printedTotal = doc.receipt.total;

  return (
    <div className="space-y-6">
      <input
        className="input text-lg font-semibold"
        placeholder="Title, e.g. Friday dinner"
        aria-label="Split title"
        maxLength={80}
        value={doc.title}
        onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))}
      />

      {doc.people.length === 0 ? (
        <Callout tone="warn">
          Add at least one person.{" "}
          <button type="button" className="font-semibold underline" onClick={() => goTo(1)}>
            Add people
          </button>
        </Callout>
      ) : calc.unassignedItemIds.length > 0 ? (
        <Callout tone="warn">
          <b>{calc.unassignedItemIds.length} item(s) aren&apos;t assigned to anyone</b>, so the split can&apos;t be
          finished yet.{" "}
          <button type="button" className="font-semibold underline" onClick={() => goTo(1)}>
            Assign items
          </button>
        </Callout>
      ) : null}

      <Section title="Breakdown">
        <Breakdown doc={doc} calc={calc} />
        {printedTotal !== null && printedTotal !== calc.total && (
          <Callout tone="warn">
            The receipt&apos;s printed total is <b>{f(printedTotal)}</b> but this split comes to <b>{f(calc.total)}</b>.
            Check the items and the service charge / VAT settings.
          </Callout>
        )}
      </Section>

      {doc.people.length > 0 && (
        <Section title={`Per person (${doc.people.length})`}>
          <ul className="space-y-2">
            {calc.people.map((p) => (
              <PersonCard key={p.personId} person={p} currency={doc.currency} mode={doc.mode} />
            ))}
          </ul>
          <p className="px-1 text-xs text-zinc-500">
            Totals add up exactly to {f(calc.total)}; any leftover satang/cents from rounding are spread one at a time.
          </p>
        </Section>
      )}

      <Section title="How to pay you (optional)">
        <div className="card space-y-3 p-4">
          <label className="block space-y-1">
            <span className="label">PromptPay number or ID</span>
            <input
              className="input"
              inputMode="numeric"
              autoComplete="off"
              placeholder="08x-xxx-xxxx or 13-digit ID"
              value={pp}
              aria-invalid={ppInvalid}
              onChange={(e) =>
                setDoc((d) => ({ ...d, payment: { ...d.payment, promptpay: e.target.value.replace(/\D/g, "").slice(0, 15) } }))
              }
            />
            {ppInvalid ? (
              <span className="text-xs text-red-600">Use a 10-digit mobile number, 13-digit ID or 15-digit e-wallet ID.</span>
            ) : (
              doc.currency === "THB" &&
              pp && <span className="text-xs text-zinc-500">Everyone gets a QR code with their exact amount.</span>
            )}
          </label>
          <label className="block space-y-1">
            <span className="label">Bank details / note</span>
            <textarea
              className="input min-h-20 py-2"
              maxLength={300}
              placeholder="e.g. KBank 123-4-56789-0 (J. Chai)"
              value={doc.payment.note}
              onChange={(e) => setDoc((d) => ({ ...d, payment: { ...d.payment, note: e.target.value } }))}
            />
          </label>
          <p className="text-xs text-zinc-500">Shown on the shared page. Remembered on this device for next time.</p>
        </div>
      </Section>
    </div>
  );
}
