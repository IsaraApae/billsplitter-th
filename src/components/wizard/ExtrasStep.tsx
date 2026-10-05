"use client";

import { Check, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { CalcResult } from "@/lib/calc";
import { wholeUnitName } from "@/lib/money";
import type { Discount, SplitDoc } from "@/lib/types";
import { Breakdown } from "../Breakdown";
import { ICON, Money, MoneyInput, PercentInput, Section, Segmented, Sheet, Toggle, cx } from "../ui";
import { PrepaidSection } from "./PrepaidSection";
import type { SetDoc } from "./Wizard";

export function ExtrasStep({ doc, setDoc, calc }: { doc: SplitDoc; setDoc: SetDoc; calc: CalcResult }) {
  const [pickOpen, setPickOpen] = useState(false);
  const d = doc.discount;
  const setDiscount = (patch: Partial<Discount>) => setDoc((x) => ({ ...x, discount: { ...x.discount, ...patch } }));
  const currency = doc.currency;
  const selectedCount = d.itemIds.length;

  return (
    <div className="space-y-6">
      <h1 className="large-title">Extras</h1>

      <Section title="Discount">
        <div className="card space-y-4 p-5">
          <Toggle
            label="Apply a discount"
            hint={
              d.enabled && calc.discount > 0 ? (
                <Money value={calc.discount} currency={currency} tone="negative" className="font-semibold" />
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
                flat
                label="Discount type"
                value={d.type}
                // Reset value when switching type so 10% doesn't become ฿10.00 by accident.
                onChange={(type) => setDiscount({ type, value: type === "percent" ? 1000 : 0 })}
                options={[
                  { value: "percent", label: "Percent %" },
                  { value: "fixed", label: "Fixed amount" },
                ]}
              />
              <div className="flex min-h-[52px] items-center justify-between gap-3">
                <span>{d.type === "percent" ? "Discount rate" : "Discount amount"}</span>
                {d.type === "percent" ? (
                  <PercentInput ariaLabel="Discount percent" bp={d.value} onChange={(value) => setDiscount({ value })} />
                ) : (
                  <MoneyInput className="w-40" ariaLabel="Discount amount" currency={currency} value={d.value} onChange={(value) => setDiscount({ value })} />
                )}
              </div>
              <Segmented
                flat
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
                <button type="button" onClick={() => setPickOpen(true)} className="flex min-h-[52px] w-full items-center justify-between text-left">
                  <span>{selectedCount ? `${selectedCount} item${selectedCount > 1 ? "s" : ""} selected` : "Choose items"}</span>
                  <ChevronRight size={20} {...ICON} className="text-ink-3" aria-hidden />
                </button>
              )}
            </>
          )}
        </div>
      </Section>

      <Section title="Service charge & VAT">
        <div className="card rows">
          <div className="flex items-center gap-3 px-5 py-3">
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
          <div className="flex items-center gap-3 px-5 py-3">
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
        <p className="px-5 text-[13px] text-ink-2">
          Each person&apos;s share of service charge and VAT is proportional to what they ordered after discount.
        </p>
      </Section>

      <PrepaidSection doc={doc} setDoc={setDoc} calc={calc} />

      <Section title="Rounding">
        <div className="card px-5 py-3">
          <Toggle
            label={`Round to whole ${wholeUnitName(currency)}`}
            hint={
              doc.roundUp ? (
                <>
                  Everyone gets a whole amount, you too — friends round up or down, but together never less than
                  their exact shares, so you never lose money
                  {calc.roundingExtra > 0 && (
                    <>
                      {" "}(you save <Money value={calc.roundingExtra} currency={currency} className="text-positive" />)
                    </>
                  )}
                  .
                </>
              ) : (
                "Friends pay whole amounts; together never less than their exact shares, so you never lose money."
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

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title="Discounted items" onConfirm={() => setPickOpen(false)}>
        <ul className="card rows overflow-hidden">
          {doc.items.map((it, i) => {
            const on = d.itemIds.includes(it.id);
            const line = calc.lines[i];
            return (
              <li key={it.id}>
                <label className="flex min-h-[52px] cursor-pointer items-center gap-3 px-5 py-2">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={on}
                    onChange={() => setDiscount({ itemIds: on ? d.itemIds.filter((x) => x !== it.id) : [...d.itemIds, it.id] })}
                  />
                  <span
                    aria-hidden
                    className={cx(
                      "grid size-7 shrink-0 place-items-center rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-accent",
                      on ? "bg-accent text-accent-ink" : "bg-[var(--field)]",
                    )}
                  >
                    {on && <Check size={16} {...ICON} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{it.name || `Item ${i + 1}`}</span>
                  <span className="text-right text-[15px] text-ink-2">
                    {line.discount > 0 && <Money value={line.discount} currency={currency} tone="negative" className="mr-2 font-semibold" />}
                    <Money value={line.lineTotal} currency={currency} tone={line.lineTotal < 0 ? "negative" : undefined} />
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
