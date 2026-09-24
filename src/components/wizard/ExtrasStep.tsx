"use client";

import type { CalcResult } from "@/lib/calc";
import { formatMoney } from "@/lib/money";
import type { Discount, SplitDoc } from "@/lib/types";
import { Breakdown } from "../Breakdown";
import { MoneyInput, PercentInput, Section, Segmented, Toggle, cx } from "../ui";
import type { SetDoc } from "./Wizard";

export function ExtrasStep({ doc, setDoc, calc }: { doc: SplitDoc; setDoc: SetDoc; calc: CalcResult }) {
  const d = doc.discount;
  const setDiscount = (patch: Partial<Discount>) => setDoc((x) => ({ ...x, discount: { ...x.discount, ...patch } }));
  const currency = doc.currency;

  return (
    <div className="space-y-6">
      <Section title="Discount">
        <div className="card space-y-4 p-4">
          <Toggle
            label="Apply a discount"
            hint={d.enabled && calc.discount > 0 ? `−${formatMoney(calc.discount, currency)}` : "Coupon, member deal, promo…"}
            checked={d.enabled}
            onChange={(enabled) => setDiscount({ enabled })}
          />
          {d.enabled && (
            <>
              <Segmented
                label="Discount type"
                value={d.type}
                onChange={(type) =>
                  // Reset value when switching type so 10% doesn't become ฿10.00 by accident.
                  setDiscount({ type, value: type === "percent" ? 1000 : 0 })
                }
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
                    className="w-36"
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
                onChange={(scope) => setDiscount({ scope })}
                options={[
                  { value: "all", label: "All items" },
                  { value: "selected", label: "Selected items" },
                ]}
              />
              {d.scope === "selected" && (
                <ul className="-mx-1 max-h-80 space-y-1 overflow-y-auto">
                  {doc.items.map((it, i) => {
                    const on = d.itemIds.includes(it.id);
                    const line = calc.lines[i];
                    return (
                      <li key={it.id}>
                        <label
                          className={cx(
                            "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2",
                            on && "bg-emerald-50 dark:bg-emerald-950/40",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-5 accent-emerald-600"
                            checked={on}
                            onChange={() =>
                              setDiscount({ itemIds: on ? d.itemIds.filter((x) => x !== it.id) : [...d.itemIds, it.id] })
                            }
                          />
                          <span className="flex-1 truncate">{it.name || `Item ${i + 1}`}</span>
                          <span className="text-sm tabular-nums text-zinc-500">
                            {line.discount > 0 && (
                              <span className="mr-2 text-emerald-700 dark:text-emerald-400">
                                −{formatMoney(line.discount, currency)}
                              </span>
                            )}
                            {formatMoney(line.lineTotal, currency)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </Section>

      <Section title="Service charge & VAT">
        <div className="card divide-y divide-zinc-100 px-4 dark:divide-zinc-800">
          <div className="flex items-center gap-3 py-3">
            <div className="flex-1">
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
            <div className="flex-1">
              <Toggle
                label="VAT"
                hint="On subtotal + service charge"
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
        <p className="px-1 text-xs text-zinc-500">
          Each person&apos;s share of service charge and VAT is proportional to what they ordered after discount.
        </p>
      </Section>

      <Section title="Breakdown">
        <Breakdown doc={doc} calc={calc} />
      </Section>
    </div>
  );
}
