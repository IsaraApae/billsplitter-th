// Draft helpers used by the editor. Pure (ids come from crypto but no I/O).

import { itemsSubtotal } from "./calc";
import { isCurrency, parseMoney } from "./money";
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
    service: { enabled: true, rateBp: 1000 },
    vat: { enabled: true, rateBp: 700 },
    payment,
    receipt: { subtotal: null, total: null },
  };
}

export function defaultTitle(date = new Date()): string {
  return `Bill · ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
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
  let currency = doc.currency;
  if (doc.items.length === 0 && scan.currency && isCurrency(scan.currency) && scan.currency !== currency) {
    currency = scan.currency;
    notes.push(`Currency set to ${currency} from the receipt.`);
  }
  const m = (v: number | null) => (v === null ? null : parseMoney(v, currency));

  const items: Item[] = scannedItems.map((s) => {
    const line = parseMoney(s.price, currency) ?? 0;
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
      next.service = { enabled: true, rateBp: bp ?? doc.service.rateBp };
      notes.push(`Service charge found on receipt (${(next.service.rateBp / 100).toString()}%).`);
    } else if (subtotal !== null || scan.total !== null) {
      next.service = { ...doc.service, enabled: false };
      notes.push("No service charge on the receipt — turned it off (you can change this in Extras).");
    }
    if (scan.vatIncluded) {
      next.vat = { ...doc.vat, enabled: false };
      notes.push("Receipt says prices include VAT — VAT turned off so it isn't added twice.");
    } else if (vat !== null && vat > 0) {
      const svc = next.service.enabled ? (service ?? 0) : 0;
      const bp = inferRateBp(vat, base + svc);
      next.vat = { enabled: true, rateBp: bp ?? doc.vat.rateBp };
      notes.push(`VAT found on receipt (${(next.vat.rateBp / 100).toString()}%).`);
    } else if (subtotal !== null || scan.total !== null) {
      notes.push("No VAT line found — check the VAT setting in Extras.");
    }
  }
  return { doc: next, notes, added: items.length, dropped };
}
