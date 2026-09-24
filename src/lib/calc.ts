// The bill-splitting maths. Pure and deterministic: no I/O, no floats for money.
//
// Order: items → discount → service charge on the discounted subtotal →
// VAT on (discounted subtotal + service charge).
//
// Every time an amount is divided, it goes through `allocate` (largest-remainder
// method on integers), so the parts always sum exactly to the whole.

import { currencyExponent } from "./money";
import type { Discount, Item, Person, Rate, SplitMode } from "./types";

export interface CalcInput {
  mode: SplitMode;
  people: Person[];
  items: Item[];
  discount: Discount;
  service: Rate;
  vat: Rate;
  /** Used to round everyone's amount up to one whole unit (฿1, $1…). */
  currency?: string;
  /** Round payers to whole units without the organiser losing money. Off unless true. */
  roundUp?: boolean;
}

/** Smallest whole-unit step for a currency, in minor units (THB → 100 satang, JPY → 1). */
export function wholeUnit(currency = "THB"): number {
  return 10 ** currencyExponent(currency);
}

/**
 * Cheapest whole-unit rounding that never loses the organiser money: the
 * group's total is rounded *up* to a whole unit, then shared out in whole
 * units — everyone gets their share rounded down, and the leftover units go
 * to the largest remainders (so some round up, some down). Each amount is
 * within one unit of the exact share, and together they're never less than
 * the exact total (surplus < 1 unit).
 */
export function roundToWholeUnits(exact: number[], unit: number): number[] {
  if (unit <= 1) return [...exact];
  const target = Math.ceil(exact.reduce((a, b) => a + b, 0) / unit);
  const floors = exact.map((v) => Math.floor(v / unit));
  let left = target - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((_, i) => i).sort((a, b) => (exact[b] % unit) - (exact[a] % unit) || a - b);
  const units = [...floors];
  for (let k = 0; left > 0; k++, left--) units[order[k]] += 1;
  return units.map((u) => u * unit);
}

/** The person who paid the bill (the device owner in new splits). */
export const ORGANISER_ID = "me";

export interface ItemLine {
  itemId: string;
  name: string;
  lineTotal: number;
  discount: number;
  discounted: number;
}

export interface PersonItemShare {
  itemId: string;
  name: string;
  /** number of people sharing this item */
  sharedBy: number;
  /** share of the pre-discount line total */
  amount: number;
}

export interface PersonResult {
  personId: string;
  name: string;
  items: PersonItemShare[];
  subtotal: number; // pre-discount
  discount: number;
  discounted: number;
  service: number;
  vat: number;
  /** exact share of the bill */
  total: number;
  /**
   * What they're asked to pay. Equals `total` unless rounding is on: then
   * payers pay whole units (some up, some down) and the organiser's amount is
   * what's left of the bill (never more than their exact share).
   */
  payable: number;
}

export interface CalcResult {
  lines: ItemLine[];
  itemsSubtotal: number;
  discount: number;
  discountedSubtotal: number;
  service: number;
  vat: number;
  total: number;
  people: PersonResult[];
  /** sum of everyone's `payable` */
  collected: number;
  /**
   * How much more the payers pay in total than their exact shares because of
   * rounding (0 ≤ extra < 1 unit). It reduces the organiser's share.
   */
  roundingExtra: number;
  unassignedItemIds: string[];
  /** true when the split can be finalised (people present, every item assigned) */
  complete: boolean;
}

/** Integer round-half-up of amount × bp / 10000 (bp = basis points). */
export function applyBp(amount: number, bp: number): number {
  if (amount <= 0 || bp <= 0) return 0;
  return Number((BigInt(amount) * BigInt(bp) + 5000n) / 10000n);
}

/**
 * Split `amount` into integer parts proportional to `weights`, summing exactly
 * to `amount`. Leftover units go to the largest remainders; ties are broken in
 * index order starting at `offset` (so equal splits can rotate who gets the
 * extra unit). All-zero weights fall back to an equal split.
 */
export function allocate(amount: number, weights: number[], offset = 0): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const w = weights.some((x) => x > 0) ? weights.map((x) => Math.max(0, x)) : weights.map(() => 1);
  const total = BigInt(w.reduce((a, b) => a + b, 0));
  const amt = BigInt(amount);
  const parts: number[] = [];
  const rems: bigint[] = [];
  for (let i = 0; i < n; i++) {
    const num = amt * BigInt(w[i]);
    parts.push(Number(num / total));
    rems.push(num % total);
  }
  let left = amount - parts.reduce((a, b) => a + b, 0);
  const rot = (i: number) => (((i - offset) % n) + n) % n;
  const order = parts
    .map((_, i) => i)
    .sort((a, b) => (rems[a] === rems[b] ? rot(a) - rot(b) : rems[b] > rems[a] ? 1 : -1));
  for (let k = 0; left > 0; k = (k + 1) % n, left--) parts[order[k]] += 1;
  return parts;
}

const equalWeights = (n: number) => Array.from({ length: n }, () => 1);

export function lineTotal(item: Pick<Item, "qty" | "price">): number {
  return item.qty * item.price;
}

export function itemsSubtotal(items: Pick<Item, "qty" | "price">[]): number {
  return items.reduce((s, it) => s + lineTotal(it), 0);
}

/** Per-item discount amounts (same order as `items`). */
export function itemDiscounts(items: Item[], discount: Discount): number[] {
  const zeros = items.map(() => 0);
  if (!discount.enabled || discount.value <= 0) return zeros;
  const selected = items.map((it) => discount.scope === "all" || discount.itemIds.includes(it.id));
  const base = items.map((it, i) => (selected[i] ? lineTotal(it) : 0));
  const eligible = base.reduce((a, b) => a + b, 0);
  if (eligible <= 0) return zeros;
  const total =
    discount.type === "percent"
      ? applyBp(eligible, Math.min(discount.value, 10000))
      : Math.min(discount.value, eligible);
  return allocate(total, base);
}

export function calculate(input: CalcInput): CalcResult {
  const { mode, people, items } = input;
  const discounts = itemDiscounts(items, input.discount);
  const lines: ItemLine[] = items.map((it, i) => {
    const lt = lineTotal(it);
    return { itemId: it.id, name: it.name, lineTotal: lt, discount: discounts[i], discounted: lt - discounts[i] };
  });

  const itemsSub = lines.reduce((s, l) => s + l.lineTotal, 0);
  const discount = lines.reduce((s, l) => s + l.discount, 0);
  const discountedSubtotal = itemsSub - discount;
  const service = input.service.enabled ? applyBp(discountedSubtotal, input.service.rateBp) : 0;
  const vat = input.vat.enabled ? applyBp(discountedSubtotal + service, input.vat.rateBp) : 0;
  const total = discountedSubtotal + service + vat;

  const n = people.length;
  const personIndex = new Map(people.map((p, i) => [p.id, i]));
  const unassignedItemIds =
    mode === "itemized"
      ? items.filter((it) => !it.assigned.some((id) => personIndex.has(id))).map((it) => it.id)
      : [];

  const results: PersonResult[] = people.map((p) => ({
    personId: p.id,
    name: p.name,
    items: [],
    subtotal: 0,
    discount: 0,
    discounted: 0,
    service: 0,
    vat: 0,
    total: 0,
    payable: 0,
  }));

  if (n > 0) {
    if (mode === "equal") {
      // Chain the equal splits with a rotating start so that, per person,
      // discounted + service + vat equals an equal split of the grand total
      // (everyone pays the same, give or take one minor unit).
      const ones = equalWeights(n);
      const ds = allocate(discountedSubtotal, ones, 0);
      const offSc = discountedSubtotal % n;
      const sc = allocate(service, ones, offSc);
      const vt = allocate(vat, ones, (offSc + (service % n)) % n);
      const sub = allocate(itemsSub, ones, 0);
      results.forEach((r, i) => {
        r.subtotal = sub[i];
        r.discounted = ds[i];
        r.discount = sub[i] - ds[i];
        r.service = sc[i];
        r.vat = vt[i];
        r.items = items.map((it) => ({ itemId: it.id, name: it.name, sharedBy: n, amount: 0 }));
      });
      // Show each person's even share of every line.
      lines.forEach((l, li) => {
        allocate(l.lineTotal, ones, li % n).forEach((a, i) => (results[i].items[li].amount = a));
      });
    } else {
      items.forEach((it, li) => {
        const who = [...new Set(it.assigned)].filter((id) => personIndex.has(id))
          .sort((a, b) => personIndex.get(a)! - personIndex.get(b)!);
        if (who.length === 0) return;
        const k = who.length;
        const ones = equalWeights(k);
        const off = li % k;
        // Same offset for both allocations, so line share − discounted share
        // is never negative and discount shares still sum exactly.
        const lineShares = allocate(lines[li].lineTotal, ones, off);
        const dsShares = allocate(lines[li].discounted, ones, off);
        who.forEach((pid, j) => {
          const r = results[personIndex.get(pid)!];
          r.subtotal += lineShares[j];
          r.discounted += dsShares[j];
          r.discount += lineShares[j] - dsShares[j];
          r.items.push({ itemId: it.id, name: it.name, sharedBy: k, amount: lineShares[j] });
        });
      });
      const weights = results.map((r) => r.discounted);
      const sc = allocate(service, weights);
      const vt = allocate(vat, weights);
      results.forEach((r, i) => {
        r.service = sc[i];
        r.vat = vt[i];
      });
    }
    results.forEach((r) => (r.total = r.discounted + r.service + r.vat));
  }

  for (const r of results) r.payable = r.total;
  const organiser = results.find((r) => r.personId === ORGANISER_ID);
  const payers = results.filter((r) => r !== organiser);
  if (input.roundUp && payers.length > 0) {
    const unit = wholeUnit(input.currency);
    const whole = roundToWholeUnits(
      payers.map((r) => r.total),
      unit,
    );
    payers.forEach((r, i) => (r.payable = whole[i]));
    // The organiser paid the bill: their share is whatever is left, which is
    // never more than their exact share (they never lose money).
    if (organiser) organiser.payable = total - payers.reduce((s, r) => s + r.payable, 0);
  }
  const collected = results.reduce((s, r) => s + r.payable, 0);
  const roundingExtra = payers.reduce((s, r) => s + (r.payable - r.total), 0);

  return {
    lines,
    itemsSubtotal: itemsSub,
    discount,
    discountedSubtotal,
    service,
    vat,
    total,
    people: results,
    collected,
    roundingExtra,
    unassignedItemIds,
    complete: n > 0 && items.length > 0 && unassignedItemIds.length === 0,
  };
}
