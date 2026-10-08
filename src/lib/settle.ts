// Several people paid at the restaurant ("Paid upfront" plus the organiser,
// who paid the rest): who pays whom so everyone ends up paying their share.
// Pure.

import { calculate, ORGANISER_ID, wholeUnit, type CalcResult } from "./calc";
import type { SplitDoc } from "./types";

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/** Friends pay each payer directly (instead of everything through the organiser). */
export const settlesDirectly = (doc: Pick<SplitDoc, "settle" | "prepaid" | "people">) =>
  doc.settle === "direct" &&
  doc.people.some((p) => p.id === ORGANISER_ID) &&
  (doc.prepaid ?? []).some((p) => p.amount > 0 && p.personId !== ORGANISER_ID);

/** Key a transfer's payment is recorded under (next to plain person ids). */
export const transferKey = (from: string, to: string) => `t:${from}:${to}`;

export function parseTransferKey(key: string): { from: string; to: string } | null {
  const m = /^t:([\w-]+):([\w-]+)$/.exec(key);
  return m ? { from: m[1], to: m[2] } : null;
}

/** What each person actually paid at the restaurant: friends' upfront amounts; the organiser the rest. */
export function paidAtRestaurant(doc: SplitDoc, calc: CalcResult = calculate(doc)): Map<string, number> {
  const paid = new Map<string, number>();
  const ids = new Set(doc.people.map((p) => p.id));
  for (const p of doc.prepaid ?? []) {
    if (p.personId !== ORGANISER_ID && ids.has(p.personId) && p.amount > 0) {
      paid.set(p.personId, (paid.get(p.personId) ?? 0) + p.amount);
    }
  }
  const others = [...paid.values()].reduce((a, b) => a + b, 0);
  if (ids.has(ORGANISER_ID)) paid.set(ORGANISER_ID, Math.max(0, calc.total - others));
  return paid;
}

/**
 * The fewest transfers so everyone ends up paying their exact share: people
 * who paid less than their share pay the ones who paid more, biggest first.
 * With "round to whole baht" each transfer is rounded up (the payers never
 * lose money).
 */
export function transfers(doc: SplitDoc, calc: CalcResult = calculate(doc)): Transfer[] {
  const paid = paidAtRestaurant(doc, calc);
  const net = calc.people.map((r) => ({ id: r.personId, net: (paid.get(r.personId) ?? 0) - r.total }));
  const debtors = net.filter((x) => x.net < 0).map((x) => ({ id: x.id, left: -x.net })).sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));
  const creditors = net.filter((x) => x.net > 0).map((x) => ({ id: x.id, left: x.net })).sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));
  const unit = doc.roundUp ? wholeUnit(doc.currency) : 1;
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left);
    if (amount > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: Math.ceil(amount / unit) * unit });
    debtors[i].left -= amount;
    creditors[j].left -= amount;
    if (debtors[i].left === 0) i++;
    if (creditors[j].left === 0) j++;
  }
  return out;
}

/** The payments of a split that can be ticked: people's, and transfers when settling directly. */
export function paymentKeys(doc: SplitDoc, calc?: CalcResult): Set<string> {
  const keys = new Set(doc.people.map((p) => p.id));
  if (settlesDirectly(doc)) for (const t of transfers(doc, calc)) keys.add(transferKey(t.from, t.to));
  return keys;
}

/** A transfer of this split by its key (null if it isn't one any more). */
export function findTransfer(doc: SplitDoc, key: string, calc?: CalcResult): Transfer | null {
  const k = parseTransferKey(key);
  if (!k || !settlesDirectly(doc)) return null;
  return transfers(doc, calc).find((t) => t.from === k.from && t.to === k.to) ?? null;
}

/** A payer's own PromptPay (friends who paid part of the bill). */
export const payerPromptPay = (doc: SplitDoc, personId: string) =>
  (doc.prepaid ?? []).find((p) => p.personId === personId)?.promptpay || undefined;

export type PayStatus = "full" | "part" | "none";

export interface PaymentState {
  paid: string[];
  partial: Record<string, number>;
}

/** One payment's status (a person's, or a transfer's). */
export function keyStatus(key: string, owed: number, state: PaymentState): { status: PayStatus; paidSoFar: number } {
  if (state.paid.includes(key)) return { status: "full", paidSoFar: Math.max(0, owed) };
  const part = state.partial[key] ?? 0;
  return { status: part > 0 ? "part" : "none", paidSoFar: part };
}

export interface OrganiserLine {
  personId: string;
  /** what they owe the organiser (positive) or the organiser owes them (negative) */
  amount: number;
  /** where their payment to/from the organiser is recorded */
  key: string;
  status: PayStatus;
  paidSoFar: number;
}

/**
 * Each friend's money with the organiser, whichever way the bill settles —
 * for History, big bills and "owes you" totals. Settling directly, only the
 * transfers to or from the organiser count.
 */
export function organiserLines(doc: SplitDoc, state: PaymentState, calc: CalcResult = calculate(doc)): OrganiserLine[] {
  if (!settlesDirectly(doc)) {
    return calc.people
      .filter((r) => r.personId !== ORGANISER_ID)
      .map((r) => ({ personId: r.personId, amount: r.payable, key: r.personId, ...keyStatus(r.personId, r.payable, state) }));
  }
  const ts = transfers(doc, calc);
  return calc.people
    .filter((r) => r.personId !== ORGANISER_ID)
    .map((r) => {
      const toMe = ts.find((t) => t.from === r.personId && t.to === ORGANISER_ID);
      const fromMe = ts.find((t) => t.from === ORGANISER_ID && t.to === r.personId);
      if (toMe) {
        const key = transferKey(toMe.from, toMe.to);
        return { personId: r.personId, amount: toMe.amount, key, ...keyStatus(key, toMe.amount, state) };
      }
      if (fromMe) {
        const key = transferKey(fromMe.from, fromMe.to);
        return { personId: r.personId, amount: -fromMe.amount, key, ...keyStatus(key, fromMe.amount, state) };
      }
      return { personId: r.personId, amount: 0, key: r.personId, status: "full" as const, paidSoFar: 0 };
    });
}

/**
 * Progress for History: how many payments are done (people, or transfers when
 * settling directly), and each friend's payment with the organiser.
 */
export function paymentSummary(
  doc: SplitDoc,
  state: PaymentState,
  calc: CalcResult = calculate(doc),
): { people: number; paid: number; paidIds: string[]; partialPaid: Record<string, number> } {
  const lines = organiserLines(doc, state, calc);
  if (!settlesDirectly(doc)) {
    // Older splits without an organiser count everyone.
    const counted = doc.people.map((p) => p.id).filter((id) => id !== ORGANISER_ID);
    return {
      people: counted.length,
      paid: state.paid.filter((id) => counted.includes(id)).length,
      paidIds: state.paid.filter((id) => counted.includes(id)),
      partialPaid: Object.fromEntries(Object.entries(state.partial).filter(([id]) => counted.includes(id))),
    };
  }
  const ts = transfers(doc, calc);
  return {
    people: ts.length,
    paid: ts.filter((t) => state.paid.includes(transferKey(t.from, t.to))).length,
    paidIds: lines.filter((l) => l.status === "full").map((l) => l.personId),
    partialPaid: Object.fromEntries(lines.filter((l) => l.status === "part").map((l) => [l.personId, l.paidSoFar])),
  };
}
