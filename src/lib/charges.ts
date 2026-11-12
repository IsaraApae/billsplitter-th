// After a scan: service charge and VAT that agree with the receipt's printed
// total. A model can misread them (VAT that's already in the prices counted
// on top, a service line missed); the total says which reading is right. Pure.

import { applyBp } from "./calc";

export interface Charges {
  /** amounts in minor units, null when there's none */
  service: number | null;
  vat: number | null;
  /** prices already include VAT (nothing added on top) */
  vatIncluded: boolean;
  /** the rate used, when it was worked out from one */
  serviceBp?: number;
  vatBp?: number;
}

/** Usual Thai rates, tried when the printed ones don't add up. */
const SERVICE_BP = [1000, 500];
const VAT_BP = [700];

/**
 * Service charge and VAT that make `base` (items after the bill-wide discount)
 * plus `rounding` come to the printed `total`, to the satang. The reading as
 * scanned wins when it adds up; otherwise the first that does, in this order:
 * VAT already in the prices, VAT on top after all, the printed amounts with a
 * missing one worked out from its rate, both worked out from their rates,
 * none at all. Nothing adds up (or no total printed): as scanned, `note` null.
 */
export function reconcileCharges(
  base: number,
  read: Charges,
  rounding: number,
  total: number | null,
  rates: { serviceBp: number | null; vatBp: number | null } = { serviceBp: null, vatBp: null },
): { charges: Charges; note: string | null } {
  const sum = (c: Charges) => base + (c.service ?? 0) + (c.vatIncluded ? 0 : (c.vat ?? 0)) + rounding;
  if (total === null || base <= 0 || Math.abs(sum(read) - total) <= 1) return { charges: read, note: null };

  const serviceRates = [...new Set([rates.serviceBp, ...SERVICE_BP].filter((x): x is number => !!x))];
  const vatRates = [...new Set([rates.vatBp, ...VAT_BP].filter((x): x is number => !!x))];
  const vatOn = (svc: number | null, bp: number) => applyBp(base + (svc ?? 0), bp);
  const pct = (bp: number) => `${bp / 100}%`;

  const tries: { c: Charges; note: string }[] = [];
  if (read.vat && !read.vatIncluded) {
    tries.push({ c: { ...read, vatIncluded: true }, note: "The receipt's VAT is already in the prices: VAT turned off so it isn't added twice." });
  }
  if (read.vatIncluded) {
    for (const bp of vatRates) {
      tries.push({ c: { ...read, vat: vatOn(read.service, bp), vatIncluded: false, vatBp: bp }, note: `VAT ${pct(bp)} is added on top on this receipt: turned it on.` });
    }
  }
  if (read.service) {
    for (const bp of vatRates) {
      tries.push({ c: { ...read, vat: vatOn(read.service, bp), vatIncluded: false, vatBp: bp }, note: `Added VAT ${pct(bp)}, which the receipt's total includes.` });
    }
  }
  if (read.vat && !read.service) {
    for (const bp of serviceRates) {
      const svc = applyBp(base, bp);
      // The printed VAT must fit this service charge too.
      if (Math.abs(vatOn(svc, rates.vatBp ?? Math.round((read.vat / (base + svc)) * 100) * 100) - read.vat) > 1) continue;
      tries.push({ c: { ...read, service: svc, serviceBp: bp, vatIncluded: false }, note: `Added service charge ${pct(bp)}, which the receipt's total includes.` });
    }
  }
  for (const sBp of [...serviceRates, 0]) {
    for (const vBp of [...vatRates, 0]) {
      if (!sBp && !vBp) continue;
      const service = sBp ? applyBp(base, sBp) : null;
      const vat = vBp ? vatOn(service, vBp) : null;
      const parts = [sBp && `service charge ${pct(sBp)}`, vBp && `VAT ${pct(vBp)}`].filter(Boolean).join(" and ");
      tries.push({
        c: { service, vat, vatIncluded: !vBp && read.vatIncluded, ...(sBp ? { serviceBp: sBp } : {}), ...(vBp ? { vatBp: vBp } : {}) },
        note: `Worked out ${parts} from the receipt's total.`,
      });
    }
  }
  if (read.service || (read.vat && !read.vatIncluded)) {
    tries.push({ c: { service: null, vat: null, vatIncluded: read.vatIncluded }, note: "The receipt's total has no service charge or VAT added: left them off." });
  }
  const fit = tries.find((t) => Math.abs(sum(t.c) - total) <= 1);
  return fit ? { charges: fit.c, note: fit.note } : { charges: read, note: null };
}
