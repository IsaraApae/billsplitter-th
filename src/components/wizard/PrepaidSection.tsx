"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { ORGANISER_ID, type CalcResult } from "@/lib/calc";
import { friendPromptPay } from "@/lib/client/friendsStore";
import { isValidPromptPayId, normalizePromptPayInput } from "@/lib/promptpay";
import { settlesDirectly, transfers } from "@/lib/settle";
import type { SettleMode, SplitDoc } from "@/lib/types";
import { TransferRow } from "../Transfers";
import { Avatar, ICON, Money, MoneyInput, Section, Segmented, Sheet } from "../ui";
import type { SetDoc } from "./Wizard";

/**
 * "Paid upfront": friends who paid part of the bill themselves (e.g. the
 * drinks). Either everyone settles with the organiser, or friends pay each
 * payer directly (each with their own PromptPay).
 */
export function PrepaidSection({ doc, setDoc, calc }: { doc: SplitDoc; setDoc: SetDoc; calc: CalcResult }) {
  const [picking, setPicking] = useState(false);
  const rows = doc.prepaid ?? [];
  const friends = doc.people.filter((p) => p.id !== ORGANISER_ID);
  // Money settles through the organiser, so this needs one (every new split has one).
  if (!doc.people.some((p) => p.id === ORGANISER_ID) || friends.length === 0) return null;
  const available = friends.filter((p) => !rows.some((r) => r.personId === p.id));
  const settle: SettleMode = doc.settle ?? "organiser";
  const direct = settle === "direct";
  const someonePaid = rows.some((r) => r.amount > 0);
  const nameOf = (id: string) => doc.people.find((p) => p.id === id);

  const setRows = (fn: (r: NonNullable<SplitDoc["prepaid"]>) => NonNullable<SplitDoc["prepaid"]>) =>
    setDoc((d) => ({ ...d, prepaid: fn(d.prepaid ?? []) }));

  return (
    <Section title="Paid upfront">
      <ul className="card rows overflow-hidden">
        {rows.map((r) => {
          const person = nameOf(r.personId);
          const result = calc.people.find((p) => p.personId === r.personId);
          if (!person) return null;
          const pp = r.promptpay ?? "";
          return (
            <li key={r.personId} className="py-2 pr-2 pl-5">
              <div className="flex min-h-12 items-center gap-3">
                <Avatar person={person} size={32} />
                <span className="min-w-0 flex-1 truncate font-semibold">{person.name}</span>
                <MoneyInput
                  className="w-36"
                  ariaLabel={`Amount ${person.name} paid`}
                  currency={doc.currency}
                  value={r.amount}
                  onChange={(amount) => setRows((xs) => xs.map((x) => (x.personId === r.personId ? { ...x, amount } : x)))}
                />
                <button
                  type="button"
                  className="icon-plain size-11"
                  aria-label={`Remove ${person.name}'s upfront payment`}
                  onClick={() => setRows((xs) => xs.filter((x) => x.personId !== r.personId))}
                >
                  <X size={20} {...ICON} />
                </button>
              </div>
              {direct ? (
                <div className="pr-3 pb-1 pl-11">
                  <span className="block px-1 pb-1 text-[13px] text-ink-2">{person.name}&apos;s PromptPay, so the others can pay them</span>
                  <input
                    className="input tnum min-h-11 text-[15px]"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="08x-xxx-xxxx (optional)"
                    aria-label={`${person.name}'s PromptPay number`}
                    value={pp}
                    aria-invalid={pp !== "" && !isValidPromptPayId(pp)}
                    onChange={(e) => {
                      const promptpay = normalizePromptPayInput(e.target.value);
                      setRows((xs) => xs.map((x) => (x.personId === r.personId ? { ...x, promptpay: promptpay || undefined } : x)));
                    }}
                  />
                  {pp !== "" && !isValidPromptPayId(pp) && (
                    <p className="pt-1 text-[13px] font-medium text-danger">Use a mobile number, 13-digit ID or e-wallet ID.</p>
                  )}
                </div>
              ) : (
                result &&
                r.amount > 0 && (
                  <p className="pb-1 pl-11 text-[13px] text-ink-2">
                    {result.payable >= 0 ? (
                      <>
                        Now pays <Money value={result.payable} currency={doc.currency} className="text-ink" />
                      </>
                    ) : (
                      <>
                        You pay them back <Money value={-result.payable} currency={doc.currency} className="text-positive" />
                      </>
                    )}
                  </p>
                )
              )}
            </li>
          );
        })}
        {available.length > 0 && (
          <li>
            <button
              type="button"
              className="flex min-h-[52px] w-full items-center gap-3 px-5 text-left font-semibold text-accent"
              onClick={() => setPicking(true)}
            >
              <Plus size={22} {...ICON} aria-hidden /> Someone paid part of the bill
            </button>
          </li>
        )}
      </ul>

      {someonePaid && (
        <div className="space-y-2">
          <p className="px-5 text-[13px] font-semibold text-ink-2">Who do the others pay?</p>
          <Segmented<SettleMode>
            label="Who do the others pay?"
            value={settle}
            onChange={(s) => setDoc((d) => ({ ...d, settle: s }))}
            options={[
              { value: "organiser", label: "Everyone pays me" },
              { value: "direct", label: "Pay whoever paid" },
            ]}
          />
        </div>
      )}

      {someonePaid && settlesDirectly(doc) && calc.complete && (
        <ul className="card rows overflow-hidden" aria-label="Who pays whom">
          {transfers(doc, calc).map((t) => {
            const from = nameOf(t.from);
            const to = nameOf(t.to);
            if (!from || !to) return null;
            return <TransferRow key={`${t.from}>${t.to}`} from={from} to={to} amount={t.amount} currency={doc.currency} you />;
          })}
        </ul>
      )}

      <p className="px-5 text-[13px] text-ink-2">
        {!someonePaid
          ? "Did a friend pay for part of it, like the drinks? Add what they paid."
          : direct
            ? "Everyone pays each person who paid what they're owed, straight to them — the shared link shows who pays whom, with each payer's PromptPay QR."
            : "They pay you that much less, or you pay them back the difference."}
      </p>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Who paid?">
        <ul className="card rows overflow-hidden">
          {available.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex min-h-[56px] w-full items-center gap-3 px-5 text-left"
                onClick={() => {
                  setRows((xs) => [...xs, { personId: p.id, amount: 0, promptpay: friendPromptPay(p.id) }]);
                  // Several people paying: friends pay each of them directly, unless chosen otherwise.
                  setDoc((d) => (d.settle ? d : { ...d, settle: "direct" }));
                  setPicking(false);
                }}
              >
                <Avatar person={p} size={36} />
                <span className="truncate">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </Section>
  );
}
