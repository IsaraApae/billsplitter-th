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
  const rows: { k: string; v: ReactNode; accent?: boolean }[] = [
    { k: "Items subtotal", v: <Money value={calc.itemsSubtotal} currency={c} /> },
  ];
  if (calc.discount > 0) {
    rows.push({ k: discountLabel, v: <>−<Money value={calc.discount} currency={c} /></>, accent: true });
    rows.push({ k: "After discount", v: <Money value={calc.discountedSubtotal} currency={c} /> });
  }
  if (doc.service.enabled) rows.push({ k: `Service charge ${pct(doc.service.rateBp)}`, v: <Money value={calc.service} currency={c} /> });
  if (doc.vat.enabled) rows.push({ k: `VAT ${pct(doc.vat.rateBp)}`, v: <Money value={calc.vat} currency={c} /> });
  return (
    <dl className="card divide-y divide-[var(--line)] px-4">
      {rows.map(({ k, v, accent }) => (
        <div key={k} className="flex justify-between gap-4 py-3 text-[15px]">
          <dt className="text-ink-2">{k}</dt>
          <dd className={accent ? "font-semibold text-accent" : "font-medium"}>{v}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 py-3.5">
        <dt className="text-[17px] font-bold">Grand total</dt>
        <dd>
          <Money value={calc.total} currency={c} className="text-[24px] font-bold tracking-tight" />
        </dd>
      </div>
    </dl>
  );
}
