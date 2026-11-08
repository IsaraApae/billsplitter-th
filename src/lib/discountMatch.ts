// Which items does a printed discount cover? A percentage discount leaves a
// fingerprint: 10% of ฿599 is exactly ฿59.90, so the discounted items must add
// up to the amount that gives exactly the printed discount. Pure.

import { applyBp } from "./calc";

/** Rates tried when only the discount amount is known (a fixed discount). */
export const COMMON_RATES_BP = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000];

export interface Line {
  id: string;
  /** line total, minor units */
  total: number;
  name?: string;
  /** the organiser (you) shares this item */
  mine?: boolean;
}

export interface DiscountMatch {
  ids: string[];
  rateBp: number;
  /** other sets that differ only by swapping items with the same price */
  alternatives: number;
}

/** Stop searching after this many steps: a big bill can have millions of combinations. */
const BUDGET = 200_000;

/** True when a percentage of `sum` gives the printed discount, allowing a satang of rounding. */
export const fits = (sum: number, rateBp: number, discount: number) => Math.abs(applyBp(sum, rateBp) - discount) <= 1;

// Promotions are usually on a kind of thing ("drinks 20%"), so sets made of one
// kind rank first. Thai has no spaces, so Thai words are matched as whole names'
// beginnings or as distinctive words.
const DRINK =
  /\b(beer|singha|leo|chang|heineken|asahi|tiger|hoegaarden|wine|soju|sake|whisk(e)?y|vodka|gin|rum|tequila|cocktail|mojito|highball|coke|cola|pepsi|sprite|fanta|schweppes|soda|water|juice|tea|coffee|latte|americano|espresso|cappuccino|mocha|milk|shake|smoothie|frapp[eé]|lemonade|drinks?|beverage)\b|เบียร์|สิงห์|ลีโอ|ช้าง|ไวน์|เหล้า|โซจู|ค็อกเทล|โค้ก|เป๊ปซี่|สไปรท์|โซดา|น้ำเปล่า|น้ำแข็ง|น้ำอัดลม|น้ำส้ม|น้ำผลไม้|น้ำมะพร้าว|ชาเย็น|ชาไทย|ชานม|ชาเขียว|ชามะนาว|กาแฟ|นมสด|ปั่น/i;

export const isDrink = (name: string) => DRINK.test(name);

/**
 * Sets of items whose total, at one of `ratesBp`, gives exactly `discount`.
 * Sets that only swap same-priced items are folded into one, keeping the swap
 * that covers more of your (the organiser's) items. When it can't be told,
 * your items get the discount: sets covering more of them come first, then one
 * kind of thing (all drinks, or all food), the whole of a kind, fewer items. `truncated` means there may be more than were found.
 */
export function findDiscountedItems(
  lines: Line[],
  discount: number,
  ratesBp: number[],
  limit = 6,
): { matches: DiscountMatch[]; truncated: boolean } {
  const items = lines.filter((l) => l.total > 0).sort((a, b) => b.total - a.total);
  const suffix = items.map((_, i) => items.slice(i).reduce((s, l) => s + l.total, 0));
  const raw: { ids: string[]; rateBp: number }[] = [];
  let steps = 0;
  let truncated = false;
  for (const bp of ratesBp) {
    if (discount <= 0 || bp <= 0) continue;
    const lo = Math.floor(((discount - 1.5) * 10000) / bp);
    const hi = Math.ceil(((discount + 1.5) * 10000) / bp);
    const picked: string[] = [];
    const walk = (i: number, sum: number) => {
      if (raw.length >= 200 || truncated) return;
      if (++steps > BUDGET) {
        truncated = true;
        return;
      }
      if (picked.length && sum >= lo && fits(sum, bp, discount)) raw.push({ ids: [...picked], rateBp: bp });
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
  if (raw.length >= 200) truncated = true;

  // Fold sets that differ only by same-priced items.
  const byId = new Map(lines.map((l) => [l.id, l]));
  const mine = (ids: string[]) => ids.reduce((s, id) => s + (byId.get(id)!.mine ? byId.get(id)!.total : 0), 0);
  const groups = new Map<string, DiscountMatch>();
  for (const m of raw) {
    const key = `${m.rateBp}:${m.ids.map((id) => byId.get(id)!.total).sort((a, b) => a - b).join(",")}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { ...m, alternatives: 0 });
    else {
      g.alternatives++;
      if (mine(m.ids) > mine(g.ids)) g.ids = m.ids;
    }
  }

  const positive = lines.filter((l) => l.total > 0);
  const drinks = new Set(positive.filter((l) => isDrink(l.name ?? "")).map((l) => l.id));
  const score = (m: DiscountMatch) => {
    const n = m.ids.filter((id) => drinks.has(id)).length;
    const oneKind = drinks.size > 0 && (n === m.ids.length || n === 0);
    const wholeKind = oneKind && (n === drinks.size || m.ids.length === positive.length - drinks.size);
    return (oneKind ? 2 : 0) + (wholeKind ? 1 : 0);
  };
  const matches = [...groups.values()].sort(
    (a, b) => mine(b.ids) - mine(a.ids) || score(b) - score(a) || a.ids.length - b.ids.length,
  );
  return { matches: matches.slice(0, limit), truncated: truncated || matches.length > limit };
}

/**
 * After a scan: which items the receipt's bill-wide discount covers, when it
 * can be told for sure. Trusts the receipt's own marks only if the maths agrees
 * (the marked items, at the printed or a common rate, give exactly the
 * discount); otherwise uses the printed rate to find the only set that fits.
 * null means it covers everything, or it can't be told.
 */
export function scanDiscountItems(
  lines: (Line & { marked?: boolean })[],
  discount: number,
  rateBp: number | null,
): { ids: string[]; from: "receipt" | "maths"; rateBp: number } | null {
  const positive = lines.filter((l) => l.total > 0);
  if (discount <= 0 || positive.length === 0) return null;
  const all = positive.reduce((s, l) => s + l.total, 0);
  const rates = rateBp ? [rateBp] : COMMON_RATES_BP;
  if (rateBp && fits(all, rateBp, discount)) return null; // the whole bill

  const marked = positive.filter((l) => l.marked);
  if (marked.length > 0 && marked.length < positive.length) {
    const sum = marked.reduce((s, l) => s + l.total, 0);
    const rate = rates.find((bp) => fits(sum, bp, discount));
    if (rate) return { ids: marked.map((l) => l.id), from: "receipt", rateBp: rate };
  }
  if (rateBp) {
    const { matches, truncated } = findDiscountedItems(lines, discount, [rateBp]);
    if (matches.length === 1 && matches[0].alternatives === 0 && !truncated) return { ids: matches[0].ids, from: "maths", rateBp };
  }
  return null;
}
