// Draft helpers used by the editor. Pure (ids come from crypto but no I/O).

import { calculate, itemsSubtotal } from "./calc";
import { currencyExponent, parseMoney } from "./money";
import type { ScanResult } from "./scanResult";
import { cleanScannedItems, type DroppedLine } from "./scanFilter";
import type { Item, PaymentInfo, SplitDoc } from "./types";

export function uid(): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
}

export function newDoc(payment: PaymentInfo = { promptpay: "", note: "" }): SplitDoc {
  return {
    v: 1,
    title: "",
    createdAt: new Date().toISOString(),
    currency: "THB",
    mode: "itemized",
    people: [],
    items: [],
    discount: { enabled: false, type: "percent", value: 1000, scope: "all", itemIds: [] },
    // Off by default; rates are pre-filled for when they're switched on.
    service: { enabled: false, rateBp: 1000 },
    vat: { enabled: false, rateBp: 700 },
    roundUp: false,
    payment,
    receipt: { subtotal: null, total: null },
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A date as YYYY-MM-DD in the local time zone (the value of a date input). */
export function toDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The bill's day: the picked date, else the day the split was started. */
export function billDay(doc: Pick<SplitDoc, "date" | "createdAt">): string {
  return doc.date ?? toDay(new Date(doc.createdAt));
}

/** The bill's day as a local-midnight Date, for display. */
export function billDate(doc: Pick<SplitDoc, "date" | "createdAt">): Date {
  const [y, m, d] = billDay(doc).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Most an item can be split into separate lines. */
export const MAX_SPLIT_QTY = 20;

/**
 * "2× Water" → "Water (1)" and "Water (2)", one unit each, so each can be
 * shared by different people. They start with the same people ticked, and
 * stay in a receipt-wide discount on selected items if the original was.
 */
export function splitItem(doc: SplitDoc, itemId: string): SplitDoc {
  const i = doc.items.findIndex((it) => it.id === itemId);
  const it = doc.items[i];
  if (!it || it.qty < 2 || it.qty > MAX_SPLIT_QTY) return doc;
  const parts = Array.from({ length: it.qty }, (_, n) => ({
    id: n === 0 ? it.id : uid(),
    name: `${it.name || "Item"} (${n + 1})`,
    qty: 1,
    price: it.price,
    assigned: [...it.assigned],
  }));
  const inDiscount = doc.discount.itemIds.includes(it.id);
  return {
    ...doc,
    items: [...doc.items.slice(0, i), ...parts, ...doc.items.slice(i + 1)],
    discount: inDiscount
      ? { ...doc.discount, itemIds: [...doc.discount.itemIds, ...parts.slice(1).map((p) => p.id)] }
      : doc.discount,
  };
}

export function defaultTitle(date = new Date()): string {
  return `Bill · ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

/**
 * After a scan: does the split's total (items − discount + service + VAT, as
 * calculated) match the receipt's printed total? Differences up to one whole
 * unit (฿1) are rounding. Returns the gap when it's bigger, otherwise null.
 */
export function totalMismatch(calculatedTotal: number, printedTotal: number | null, currency: string): number | null {
  if (printedTotal === null) return null;
  const gap = calculatedTotal - printedTotal;
  return Math.abs(gap) > 10 ** currencyExponent(currency) ? gap : null;
}

/** Nearest sensible percentage (bp) for a printed amount over a base. */
function inferRateBp(amount: number, base: number): number | null {
  if (base <= 0 || amount <= 0) return null;
  const bp = Math.round((amount / base) * 10000);
  const whole = Math.round(bp / 100) * 100;
  return Math.abs(bp - whole) <= 20 ? whole : bp;
}

/**
 * Merge a scan into the draft. Returns the new doc plus human-readable notes
 * about anything we inferred (so nothing changes silently).
 */
export function applyScan(
  doc: SplitDoc,
  scan: ScanResult,
): { doc: SplitDoc; notes: string[]; added: number; dropped: DroppedLine[] } {
  const notes: string[] = [];
  // Same clean-up whichever engine read the receipt.
  const { items: scannedItems, dropped } = cleanScannedItems(scan.items);
  // The split keeps its own currency (THB for new splits); there's no picker.
  const currency = doc.currency;
  // The first receipt of a split sets its date (a later one doesn't override it).
  const date = doc.items.length === 0 && scan.date ? scan.date : doc.date;
  // The shop's name becomes the title, unless the user already typed one.
  const title = !doc.title.trim() && scan.merchant ? scan.merchant : doc.title;
  if (title !== doc.title) notes.push(`Title set to "${title}" from the receipt.`);
  if (date !== doc.date)
    notes.push(`Date set to ${billDate({ date: date!, createdAt: doc.createdAt }).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} from the receipt.`);
  const m = (v: number | null) => (v === null ? null : parseMoney(v, currency));

  const items: Item[] = scannedItems.map((s) => {
    // Negative lines are discounts on one item; keep the sign.
    const abs = parseMoney(Math.abs(s.price), currency) ?? 0;
    const line = s.price < 0 ? -abs : abs;
    if (s.qty > 1 && line % s.qty === 0) {
      return { id: uid(), name: s.name, qty: s.qty, price: line / s.qty, assigned: [] };
    }
    // Line total doesn't divide evenly by qty — keep the exact line total.
    return { id: uid(), name: s.qty > 1 ? `${s.name} ×${s.qty}` : s.name, qty: 1, price: line, assigned: [] };
  });

  const subtotal = m(scan.subtotal);
  const discount = m(scan.discount);
  const service = m(scan.serviceCharge);
  const vat = m(scan.vat);
  const next: SplitDoc = {
    ...doc,
    currency,
    date,
    title,
    items: [...doc.items, ...items],
    receipt: {
      subtotal: doc.items.length === 0 ? subtotal : null,
      total: doc.items.length === 0 ? m(scan.total) : null,
    },
  };

  // Only infer extras on the first scan, so a second receipt page can't clobber choices.
  if (doc.items.length === 0 && items.length > 0) {
    const base = (subtotal ?? itemsSubtotal(items)) - (discount ?? 0);
    if (discount && discount > 0) {
      next.discount = { enabled: true, type: "fixed", value: discount, scope: "all", itemIds: [] };
      notes.push("Receipt shows a discount — added it as a fixed discount on all items.");
    }
    if (service !== null && service > 0) {
      const bp = inferRateBp(service, base);
      next.service = { enabled: true, rateBp: bp ?? doc.service.rateBp, amount: service };
      notes.push(`Service charge found on receipt (${(next.service.rateBp / 100).toString()}%) — using the printed amount.`);
    } else if (doc.service.enabled && (subtotal !== null || scan.total !== null)) {
      next.service = { ...doc.service, enabled: false };
      notes.push("No service charge on the receipt — turned it off (you can change this in Extras).");
    }
    if (scan.vatIncluded) {
      if (doc.vat.enabled) notes.push("Receipt says prices include VAT — VAT turned off so it isn't added twice.");
      next.vat = { ...doc.vat, enabled: false };
    } else if (vat !== null && vat > 0) {
      const svc = next.service.enabled ? (service ?? 0) : 0;
      const bp = inferRateBp(vat, base + svc);
      next.vat = { enabled: true, rateBp: bp ?? doc.vat.rateBp, amount: vat };
      notes.push(`VAT found on receipt (${(next.vat.rateBp / 100).toString()}%) — using the printed amount.`);
    } else if (doc.vat.enabled && (subtotal !== null || scan.total !== null)) {
      notes.push("No VAT line found — check the VAT setting in Extras.");
    }
    const rounding = scan.rounding ? m(Math.abs(scan.rounding)) : null;
    if (rounding) {
      next.receiptRounding = { amount: scan.rounding! < 0 ? -rounding : rounding, base: 0 };
      notes.push("The receipt rounds its total — included the same rounding.");
    }
    // Printed amounts apply to this exact bill: tie them to its discounted
    // subtotal so they fall back to percentages if the items change later.
    const ds = calculate(next).discountedSubtotal;
    if (next.service.amount !== undefined) next.service = { ...next.service, base: ds };
    if (next.vat.amount !== undefined) next.vat = { ...next.vat, base: ds };
    if (next.receiptRounding) next.receiptRounding = { ...next.receiptRounding, base: ds };
  }
  return { doc: next, notes, added: items.length, dropped };
}
