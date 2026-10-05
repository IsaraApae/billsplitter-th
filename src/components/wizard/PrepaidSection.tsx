"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { ORGANISER_ID, type CalcResult } from "@/lib/calc";
import type { SplitDoc } from "@/lib/types";
import { Avatar, ICON, Money, MoneyInput, Section, Sheet } from "../ui";
import type { SetDoc } from "./Wizard";

/** "Paid upfront": friends who paid part of the bill themselves (e.g. the drinks). */
export function PrepaidSection({ doc, setDoc, calc }: { doc: SplitDoc; setDoc: SetDoc; calc: CalcResult }) {
  const [picking, setPicking] = useState(false);
  const rows = doc.prepaid ?? [];
  const friends = doc.people.filter((p) => p.id !== ORGANISER_ID);
  // Money settles through the organiser, so this needs one (every new split has one).
  if (!doc.people.some((p) => p.id === ORGANISER_ID) || friends.length === 0) return null;
  const available = friends.filter((p) => !rows.some((r) => r.personId === p.id));

  const setRows = (fn: (r: NonNullable<SplitDoc["prepaid"]>) => NonNullable<SplitDoc["prepaid"]>) =>
    setDoc((d) => ({ ...d, prepaid: fn(d.prepaid ?? []) }));

  return (
    <Section title="Paid upfront">
      <ul className="card rows overflow-hidden">
        {rows.map((r) => {
          const person = doc.people.find((p) => p.id === r.personId);
          const result = calc.people.find((p) => p.personId === r.personId);
          if (!person) return null;
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
              {result && r.amount > 0 && (
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
      <p className="px-5 text-[13px] text-ink-2">
        Did a friend pay for part of it, like the drinks? They pay you that much less, or you pay them back the
        difference.
      </p>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Who paid?">
        <ul className="card rows overflow-hidden">
          {available.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex min-h-[56px] w-full items-center gap-3 px-5 text-left"
                onClick={() => {
                  setRows((xs) => [...xs, { personId: p.id, amount: 0 }]);
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
