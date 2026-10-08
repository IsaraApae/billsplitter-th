import type { ReactNode } from "react";
import type { CalcResult } from "@/lib/calc";
import type { SplitDoc } from "@/lib/types";
import { Money } from "./ui";

const pct = (bp: number) => `${bp / 100}%`;

/** Bill-level breakdown: items → discount → service → VAT → total. */
export function Breakdown({
  doc,
  calc,
}: {
  doc: Pick<SplitDoc, "currency" | "discount" | "service" | "vat">;
  calc: CalcResult;
}) {
  const c = doc.currency;
  const d = doc.discount;
  const discountLabel = `${d.type === "percent" ? `Discount ${pct(d.value)}` : "Discount"}${d.scope === "selected" ? " (selected)" : ""}`;
  const rows: { k: string; v: ReactNode }[] = [
    { k: "Items subtotal", v: <Money value={calc.itemsSubtotal} currency={c} tone={calc.itemsSubtotal < 0 ? "negative" : undefined} /> },
  ];
  if (calc.discount > 0) {
    rows.push({ k: discountLabel, v: <Money value={calc.discount} currency={c} tone="negative" /> });
    rows.push({ k: "After discount", v: <Money value={calc.discountedSubtotal} currency={c} /> });
  }
  if (doc.service.enabled) rows.push({ k: `Service charge ${pct(doc.service.rateBp)}`, v: <Money value={calc.service} currency={c} /> });
  if (doc.vat.enabled) rows.push({ k: `VAT ${pct(doc.vat.rateBp)}`, v: <Money value={calc.vat} currency={c} /> });
  if (calc.rounding) rows.push({ k: "Rounding (as on the receipt)", v: <Money value={calc.rounding} currency={c} tone={calc.rounding < 0 ? "negative" : undefined} /> });
  return (
    <dl className="card rows">
      {rows.map(({ k, v }) => (
        <div key={k} className="flex min-h-[52px] items-center justify-between gap-4 px-5 py-3">
          <dt className="text-ink-2">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
      <div className="flex min-h-[60px] items-center justify-between gap-4 px-5 py-3">
        <dt className="font-semibold">Grand total</dt>
        <dd>
          <Money value={calc.total} currency={c} className="text-[24px] font-bold tracking-tight" />
        </dd>
      </div>
    </dl>
  );
}
