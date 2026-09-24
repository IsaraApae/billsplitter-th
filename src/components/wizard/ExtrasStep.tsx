"use client";

import { Check, ChevronRight } from "lucide-react";
import { useState } from "react";
import { wholeUnit, type CalcResult } from "@/lib/calc";
import { formatStep } from "@/lib/money";
import type { Discount, SplitDoc } from "@/lib/types";
import { Breakdown } from "../Breakdown";
import { Money, MoneyInput, PercentInput, Section, Segmented, Sheet, Toggle, cx } from "../ui";
import type { SetDoc } from "./Wizard";

export function ExtrasStep({ doc, setDoc, calc }: { doc: SplitDoc; setDoc: SetDoc; calc: CalcResult }) {
  const [pickOpen, setPickOpen] = useState(false);
  const d = doc.discount;
  const setDiscount = (patch: Partial<Discount>) => setDoc((x) => ({ ...x, discount: { ...x.discount, ...patch } }));
  const currency = doc.currency;
  const selectedCount = d.itemIds.length;

  return (
    <div className="space-y-7">
      <h1 className="large-title">Extras</h1>

      <Section title="Discount">
        <div className="card space-y-4 p-4">
          <Toggle
            label="Apply a discount"
            hint={
              d.enabled && calc.discount > 0 ? (
                <span className="font-semibold text-accent">
                  −<Money value={calc.discount} currency={currency} />
                </span>
              ) : (
                "Coupon, member deal, promo…"
              )
            }
            checked={d.enabled}
            onChange={(enabled) => setDiscount({ enabled })}
          />
          {d.enabled && (
            <>
              <Segmented
                label="Discount type"
                value={d.type}
                // Reset value when switching type so 10% doesn't become ฿10.00 by accident.
                onChange={(type) => setDiscount({ type, value: type === "percent" ? 1000 : 0 })}
                options={[
                  { value: "percent", label: "Percent %" },
                  { value: "fixed", label: "Fixed amount" },
                ]}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="label">{d.type === "percent" ? "Discount rate" : "Discount amount"}</span>
                {d.type === "percent" ? (
                  <PercentInput ariaLabel="Discount percent" bp={d.value} onChange={(value) => setDiscount({ value })} />
                ) : (
                  <MoneyInput
                    className="w-40"
                    ariaLabel="Discount amount"
                    currency={currency}
                    value={d.value}
                    onChange={(value) => setDiscount({ value })}
                  />
                )}
              </div>
              <Segmented
                label="Discount applies to"
                value={d.scope}
                onChange={(scope) => {
                  setDiscount({ scope });
                  if (scope === "selected" && selectedCount === 0) setPickOpen(true);
                }}
                options={[
                  { value: "all", label: "All items" },
                  { value: "selected", label: "Selected items" },
                ]}
              />
              {d.scope === "selected" && (
                <button
                  type="button"
                  onClick={() => setPickOpen(true)}
                  className="flex min-h-12 w-full items-center justify-between rounded-2xl bg-field px-4 text-left font-semibold shadow-[inset_0_0_0_1px_var(--field-border)]"
                >
                  {selectedCount ? `${selectedCount} item${selectedCount > 1 ? "s" : ""} selected` : "Choose items"}
                  <ChevronRight size={18} className="text-ink-3" aria-hidden />
                </button>
              )}
            </>
          )}
        </div>
      </Section>

      <Section title="Service charge & VAT">
        <div className="card divide-y divide-[var(--line)] px-4">
          <div className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <Toggle
                label="Service charge"
                hint="On the discounted subtotal"
                checked={doc.service.enabled}
                onChange={(enabled) => setDoc((x) => ({ ...x, service: { ...x.service, enabled } }))}
              />
            </div>
            {doc.service.enabled && (
              <PercentInput
                ariaLabel="Service charge percent"
                bp={doc.service.rateBp}
                onChange={(rateBp) => setDoc((x) => ({ ...x, service: { ...x.service, rateBp } }))}
              />
            )}
          </div>
          <div className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <Toggle
                label="VAT"
                hint="On subtotal + service"
                checked={doc.vat.enabled}
                onChange={(enabled) => setDoc((x) => ({ ...x, vat: { ...x.vat, enabled } }))}
              />
            </div>
            {doc.vat.enabled && (
              <PercentInput
                ariaLabel="VAT percent"
                bp={doc.vat.rateBp}
                onChange={(rateBp) => setDoc((x) => ({ ...x, vat: { ...x.vat, rateBp } }))}
              />
            )}
          </div>
        </div>
        <p className="px-1 text-[13px] text-ink-2">
          Each person&apos;s share of service charge and VAT is proportional to what they ordered after discount.
        </p>
      </Section>

      <Section title="Round up">
        <div className="card p-4">
          <Toggle
            label={`Round up to the nearest ${formatStep(wholeUnit(currency), currency)}`}
            hint={
              doc.roundUp && calc.roundingExtra > 0 ? (
                <>
                  Friends pay <Money value={calc.roundingExtra} currency={currency} /> more in total, which goes to you.
                  Nobody rounds down, so you never lose money.
                </>
              ) : (
                "Everyone's share rounds up to a whole number. Nobody rounds down, so you never lose money."
              )
            }
            checked={!!doc.roundUp}
            onChange={(roundUp) => setDoc((x) => ({ ...x, roundUp }))}
          />
        </div>
      </Section>

      <Section title="Breakdown">
        <Breakdown doc={doc} calc={calc} />
      </Section>

      <Sheet
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        title="Discounted items"
        footer={
          <button type="button" className="btn-primary h-13 w-full text-[17px]" onClick={() => setPickOpen(false)}>
            Done
          </button>
        }
      >
        <ul className="space-y-1">
          {doc.items.map((it, i) => {
            const on = d.itemIds.includes(it.id);
            const line = calc.lines[i];
            return (
              <li key={it.id}>
                <label className="flex min-h-13 cursor-pointer items-center gap-3 rounded-2xl px-2 hover:bg-[var(--hover)]">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={on}
                    onChange={() => setDiscount({ itemIds: on ? d.itemIds.filter((x) => x !== it.id) : [...d.itemIds, it.id] })}
                  />
                  <span
                    aria-hidden
                    className={cx(
                      "grid size-7 shrink-0 place-items-center rounded-full peer-focus-visible:ring-4 peer-focus-visible:ring-accent/30",
                      on ? "bg-accent text-accent-ink" : "shadow-[inset_0_0_0_2px_var(--field-border)]",
                    )}
                  >
                    {on && <Check size={16} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{it.name || `Item ${i + 1}`}</span>
                  <span className="text-right text-[14px] text-ink-2">
                    {line.discount > 0 && (
                      <span className="mr-2 font-semibold text-accent">
                        −<Money value={line.discount} currency={currency} />
                      </span>
                    )}
                    <Money value={line.lineTotal} currency={currency} />
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}
