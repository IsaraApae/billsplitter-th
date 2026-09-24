import type { CalcResult } from "@/lib/calc";
import { formatMoney } from "@/lib/money";
import type { SplitDoc } from "@/lib/types";

const pct = (bp: number) => `${bp / 100}%`;

/** Bill-level breakdown: items → discount → service → VAT → total. */
export function Breakdown({ doc, calc }: { doc: Pick<SplitDoc, "currency" | "discount" | "service" | "vat">; calc: CalcResult }) {
  const f = (n: number) => formatMoney(n, doc.currency);
  const d = doc.discount;
  const discountLabel =
    d.type === "percent" ? `Discount ${pct(d.value)}` : "Discount";
  const rows: [string, string, string?][] = [["Items subtotal", f(calc.itemsSubtotal)]];
  if (calc.discount > 0) {
    rows.push([`${discountLabel}${d.scope === "selected" ? " (selected items)" : ""}`, `−${f(calc.discount)}`, "text-emerald-700 dark:text-emerald-400"]);
    rows.push(["After discount", f(calc.discountedSubtotal)]);
  }
  if (doc.service.enabled) rows.push([`Service charge ${pct(doc.service.rateBp)}`, f(calc.service)]);
  if (doc.vat.enabled) rows.push([`VAT ${pct(doc.vat.rateBp)}`, f(calc.vat)]);
  return (
    <dl className="card divide-y divide-zinc-100 px-4 dark:divide-zinc-800">
      {rows.map(([k, v, cls]) => (
        <div key={k} className="flex justify-between gap-4 py-2.5 text-[15px]">
          <dt className="text-zinc-600 dark:text-zinc-400">{k}</dt>
          <dd className={`tabular-nums ${cls ?? ""}`}>{v}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-4 py-3 text-lg font-bold">
        <dt>Grand total</dt>
        <dd className="tabular-nums">{f(calc.total)}</dd>
      </div>
    </dl>
  );
}
