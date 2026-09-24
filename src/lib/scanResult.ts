// Shape returned by /api/scan, plus a defensive sanitiser for model output. Pure.

export interface ScanResult {
  items: { name: string; qty: number; price: number }[]; // price = LINE total, major units
  subtotal: number | null;
  serviceCharge: number | null;
  vat: number | null;
  vatIncluded: boolean;
  discount: number | null;
  total: number | null;
  currency: string | null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 && v < 1e9 ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.]/g, ""));
    return v.trim() && Number.isFinite(n) && n < 1e9 ? n : null;
  }
  return null;
}

/** Extracts the JSON object from model text (tolerates ``` fences / prose). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in response");
  return JSON.parse(text.slice(start, end + 1));
}

export function sanitizeScan(raw: unknown): ScanResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(o.items) ? o.items : [];
  const items = rawItems
    .slice(0, 200)
    .map((r) => {
      const it = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const name = typeof it.name === "string" ? it.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
      const qtyN = num(it.qty);
      const qty = qtyN && qtyN >= 1 && qtyN <= 999 ? Math.round(qtyN) : 1;
      const price = num(it.price);
      return { name: name || "Item", qty, price: price ?? 0 };
    })
    .filter((it) => it.price > 0 || it.name !== "Item");
  const currency = typeof o.currency === "string" && /^[A-Z]{3}$/.test(o.currency) ? o.currency : null;
  return {
    items,
    subtotal: num(o.subtotal),
    serviceCharge: num(o.service_charge),
    vat: num(o.vat),
    vatIncluded: o.vat_included === true,
    discount: num(o.discount),
    total: num(o.total),
    currency,
  };
}
