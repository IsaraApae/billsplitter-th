// Which items does a printed discount cover? A percentage discount leaves a
// fingerprint: 10% of ฿599 is exactly ฿59.90, so the discounted items must add
// up to the amount that gives exactly the printed discount. Pure.

import { applyBp } from "./calc";

/** Rates tried when only the discount amount is known (a fixed discount). */
export const COMMON_RATES_BP = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000];

export interface DiscountMatch {
  ids: string[];
  rateBp: number;
}

/** Stop searching after this many steps: a big bill can have millions of combinations. */
const BUDGET = 200_000;

/**
 * Sets of items whose total, at one of `ratesBp`, gives exactly `discount`
 * (within one satang either way, as receipts round), fewest items first.
 * `truncated` means there may be more than were found.
 */
export function findDiscountedItems(
  lines: { id: string; total: number }[],
  discount: number,
  ratesBp: number[],
  limit = 6,
): { matches: DiscountMatch[]; truncated: boolean } {
  const items = lines.filter((l) => l.total > 0).sort((a, b) => b.total - a.total);
  const suffix = items.map((_, i) => items.slice(i).reduce((s, l) => s + l.total, 0));
  const matches: DiscountMatch[] = [];
  let steps = 0;
  let truncated = false;
  for (const bp of ratesBp) {
    if (discount <= 0 || bp <= 0) continue;
    // The item totals that could round to the printed amount at this rate.
    const lo = Math.floor(((discount - 1.5) * 10000) / bp);
    const hi = Math.ceil(((discount + 1.5) * 10000) / bp);
    const picked: string[] = [];
    const walk = (i: number, sum: number) => {
      if (matches.length >= limit * 4 || truncated) return;
      if (++steps > BUDGET) {
        truncated = true;
        return;
      }
      if (sum >= lo && Math.abs(applyBp(sum, bp) - discount) <= 1 && picked.length) matches.push({ ids: [...picked], rateBp: bp });
      if (i >= items.length || sum + suffix[i] < lo) return;
      for (let j = i; j < items.length; j++) {
        if (sum + items[j].total > hi) continue;
        picked.push(items[j].id);
        walk(j + 1, sum + items[j].total);
        picked.pop();
      }
    };
    walk(0, 0);
  }
  matches.sort((a, b) => a.ids.length - b.ids.length);
  return { matches: matches.slice(0, limit), truncated: truncated || matches.length > limit };
}
