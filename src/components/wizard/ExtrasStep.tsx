"use client";

import { Check, ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { applyBp, ORGANISER_ID, type CalcResult } from "@/lib/calc";
import { COMMON_RATES_BP, findDiscountedItems, type DiscountMatch } from "@/lib/discountMatch";
import { wholeUnitName } from "@/lib/money";
import type { Discount, SplitDoc } from "@/lib/types";
import { Breakdown } from "../Breakdown";
import { Callout, ICON, Money, MoneyInput, PercentInput, Section, Segmented, Sheet, Toggle, cx } from "../ui";
import { PrepaidSection } from "./PrepaidSection";
import type { SetDoc } from "./Wizard";

export function ExtrasStep({ doc, setDoc, calc }: { doc: SplitDoc; setDoc: SetDoc; calc: CalcResult }) {
  const [pickOpen, setPickOpen] = useState(false);
  const d = doc.discount;
  const setDiscount = (patch: Partial<Discount>) => setDoc((x) => ({ ...x, discount: { ...x.discount, ...patch } }));
  const currency = doc.currency;
  const selectedCount = d.itemIds.length;
  // Service / VAT taken exactly as printed on the scanned receipt (while the items are unchanged).
  const printedService = doc.service.amount !== undefined && doc.service.base === calc.discountedSubtotal;
  const printedVat = doc.vat.amount !== undefined && doc.vat.base === calc.discountedSubtotal;

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
                hint={
                  printedService ? (
                    <>
                      <Money value={calc.service} currency={currency} /> as printed on the receipt
                    </>
                  ) : (
                    "On the discounted subtotal"
                  )
                }
                checked={doc.service.enabled}
                onChange={(enabled) => setDoc((x) => ({ ...x, service: { ...x.service, enabled } }))}
              />
            </div>
            {doc.service.enabled && (
              <PercentInput
                ariaLabel="Service charge percent"
                bp={doc.service.rateBp}
                // Typing a percentage replaces the receipt's printed amount.
                onChange={(rateBp) => setDoc((x) => ({ ...x, service: { ...x.service, rateBp, amount: undefined, base: undefined } }))}
              />
            )}
          </div>
          <div className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <Toggle
                label="VAT"
                hint={
                  printedVat ? (
                    <>
                      <Money value={calc.vat} currency={currency} /> as printed on the receipt
                    </>
                  ) : (
                    "On subtotal + service"
                  )
                }
                checked={doc.vat.enabled}
                onChange={(enabled) => setDoc((x) => ({ ...x, vat: { ...x.vat, enabled } }))}
              />
            </div>
            {doc.vat.enabled && (
              <PercentInput
                ariaLabel="VAT percent"
                bp={doc.vat.rateBp}
                onChange={(rateBp) => setDoc((x) => ({ ...x, vat: { ...x.vat, rateBp, amount: undefined, base: undefined } }))}
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
                  {doc.mode === "equal"
                    ? "Everyone's share is the same whole amount, yours too (each share rounded up), so you never lose money"
                    : "Everyone gets a whole amount, you too — friends round up or down, but together never less than their exact shares, so you never lose money"}
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
        <DiscountFinder doc={doc} calc={calc} onPick={(ids) => setDiscount({ itemIds: ids })} />
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
                      on ? "bg-accent-fill text-accent-ink" : "bg-[var(--field)]",
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

const pct = (bp: number) => `${bp / 100}%`;

/**
 * "Not sure which items?": works out which items the receipt's discount covers.
 * A percentage needs the printed discount amount; a fixed amount tries the common rates.
 */
function DiscountFinder({ doc, calc, onPick }: { doc: SplitDoc; calc: CalcResult; onPick: (ids: string[]) => void }) {
  const d = doc.discount;
  const currency = doc.currency;
  const [printed, setPrinted] = useState(0);
  const [result, setResult] = useState<{ matches: DiscountMatch[]; truncated: boolean } | null>(null);
  const amount = d.type === "fixed" ? d.value : printed;
  const name = (id: string) => {
    const i = doc.items.findIndex((it) => it.id === id);
    return doc.items[i]?.name || `Item ${i + 1}`;
  };

  function find() {
    const lines = doc.items.map((it, i) => ({
      id: it.id,
      total: calc.lines[i].lineTotal,
      name: it.name,
      mine: it.assigned.includes(ORGANISER_ID),
    }));
    const r = findDiscountedItems(lines, amount, d.type === "percent" ? [d.value] : COMMON_RATES_BP);
    setResult(r);
    // Tick it straight away only when one set of prices fits (a same-priced
    // swap goes your way).
    if (r.matches.length === 1 && !r.truncated) onPick(r.matches[0].ids);
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="card space-y-3 p-4">
        <p className="flex items-center gap-2 font-semibold">
          <Sparkles size={20} {...ICON} className="text-accent" aria-hidden /> Not sure which items?
        </p>
        {d.type === "percent" ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] text-ink-2">{pct(d.value)} discount on the receipt</span>
            <MoneyInput
              className="w-36 shrink-0"
              ariaLabel="Discount printed on the receipt"
              currency={currency}
              value={printed}
              onChange={(v) => {
                setPrinted(v);
                setResult(null);
              }}
            />
          </div>
        ) : (
          <p className="text-[15px] text-ink-2">
            Finds the items that <Money value={d.value} currency={currency} /> is exactly 5%, 10%, 15%… up to 50% of.
          </p>
        )}
        <button type="button" className="btn-secondary h-11 w-full" disabled={amount <= 0} onClick={find}>
          Find the items for me
        </button>
      </div>

      {result && result.matches.length === 0 && (
        <Callout tone="warn">
          No set of items comes to exactly <Money value={amount} currency={currency} />
          {d.type === "percent" ? ` at ${pct(d.value)}` : " at a common percentage"}. Check the amount, or tick the items yourself.
        </Callout>
      )}
      {result && result.matches.length === 1 && !result.truncated && (
        <Callout tone="success">
          Selected {result.matches[0].ids.map(name).join(", ")}: {pct(result.matches[0].rateBp)} of {result.matches[0].ids.length === 1 ? "it" : "them"} is
          exactly <Money value={amount} currency={currency} />.
          {result.matches[0].alternatives > 0 && " Other items have the same prices; it picked yours where it could."}
        </Callout>
      )}
      {result && (result.matches.length > 1 || (result.matches.length === 1 && result.truncated)) && (
        <div className="space-y-2">
          <p className="px-1 text-[15px] text-ink-2">
            {result.truncated ? "Several sets of items fit, including these." : "These sets of items all fit."} Yours and the most likely first; tap the one on your receipt:
          </p>
          <ul className="card rows overflow-hidden">
            {result.matches.map((m) => {
              const sum = m.ids.reduce((s, id) => s + calc.lines[doc.items.findIndex((it) => it.id === id)].lineTotal, 0);
              return (
                <li key={`${m.rateBp}:${m.ids.join(",")}`}>
                  <button type="button" className="flex min-h-[52px] w-full items-center gap-3 px-5 py-2 text-left" onClick={() => onPick(m.ids)}>
                    <span className="min-w-0 flex-1">
                      {m.ids.map(name).join(", ")}
                      {m.alternatives > 0 && (
                        <span className="block text-[13px] text-ink-2">
                          or {m.alternatives} other {m.alternatives === 1 ? "set" : "sets"} with the same prices
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[15px] text-ink-2">
                      {pct(m.rateBp)} of <Money value={sum} currency={currency} /> = <Money value={applyBp(sum, m.rateBp)} currency={currency} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
