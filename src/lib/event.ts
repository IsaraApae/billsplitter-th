// A "big bill": several splits from one outing (e.g. dinner, karaoke, late
// food) combined so each friend sees and pays one total. Pure.

import { calculate, ORGANISER_ID } from "./calc";
import type { PersonColor, SplitDoc } from "./types";

export interface EventMeta {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  splitIds: string[];
}

/** One bill of the event as loaded from storage, with its payments. */
export interface EventBill {
  id: string;
  doc: SplitDoc;
  paid: string[];
  partial: Record<string, number>;
}

export type PayStatus = "full" | "part" | "none";

export interface EventPersonBill {
  splitId: string;
  title: string;
  /** this person's id in that bill */
  personId: string;
  /** what they're asked to pay for that bill (negative = owed back) */
  amount: number;
  paidSoFar: number;
  status: PayStatus;
}

export interface EventPerson {
  /** stable key: the first id this person has across the bills */
  key: string;
  name: string;
  emoji?: string;
  color?: PersonColor;
  organiser: boolean;
  /** sum of what they're asked to pay across the bills */
  total: number;
  /** paid so far across the bills (full payments count their whole amount) */
  paidSoFar: number;
  status: PayStatus;
  bills: EventPersonBill[];
}

const norm = (name: string) => name.trim().toLocaleLowerCase();

/**
 * Everyone across the bills, merged by id — or by name, for people typed into
 * a single bill (they get a new id each time). The organiser is "me" in every
 * bill and comes first.
 */
export function eventPeople(bills: EventBill[]): EventPerson[] {
  const people: EventPerson[] = [];
  const byId = new Map<string, EventPerson>();
  const byName = new Map<string, EventPerson>();

  for (const bill of bills) {
    const calc = calculate(bill.doc);
    bill.doc.people.forEach((p, i) => {
      const r = calc.people[i];
      let person = byId.get(p.id) ?? (p.id === ORGANISER_ID ? undefined : byName.get(norm(p.name)));
      if (!person) {
        person = {
          key: p.id,
          name: p.name,
          emoji: p.emoji,
          color: p.color,
          organiser: p.id === ORGANISER_ID,
          total: 0,
          paidSoFar: 0,
          status: "none",
          bills: [],
        };
        people.push(person);
        if (!person.organiser) byName.set(norm(p.name), person);
      }
      byId.set(p.id, person);
      const full = bill.paid.includes(p.id);
      const part = full ? 0 : (bill.partial[p.id] ?? 0);
      person.bills.push({
        splitId: bill.id,
        title: bill.doc.title,
        personId: p.id,
        amount: r.payable,
        paidSoFar: full ? Math.max(0, r.payable) : part,
        status: full ? "full" : part > 0 ? "part" : "none",
      });
    });
  }

  for (const p of people) {
    p.total = p.bills.reduce((s, b) => s + b.amount, 0);
    p.paidSoFar = p.bills.reduce((s, b) => s + b.paidSoFar, 0);
    const owing = p.bills.filter((b) => b.amount > 0);
    p.status =
      owing.length > 0 && owing.every((b) => b.status === "full")
        ? "full"
        : p.paidSoFar > 0
          ? "part"
          : p.bills.length > 0 && p.bills.every((b) => b.status === "full")
            ? "full"
            : "none";
  }
  return people.sort((a, b) => Number(b.organiser) - Number(a.organiser));
}

/** What to record in each bill when the organiser records a payment for the whole event. */
export type BillPayment = { splitId: string; personId: string } & (
  | { kind: "full" }
  | { kind: "part"; amount: number }
  | { kind: "none" }
);

/**
 * Paid in full → every bill full; not paid → every bill cleared; paid part
 * (`amount`) → fills their bills in order: whole bills first, then a part of
 * the next one. Bills where they're owed money back aren't touched by a part.
 */
export function spreadPayment(
  person: EventPerson,
  payment: { kind: "full" } | { kind: "none" } | { kind: "part"; amount: number },
): BillPayment[] {
  if (payment.kind !== "part") {
    return person.bills.map((b) => ({ splitId: b.splitId, personId: b.personId, kind: payment.kind }));
  }
  let left = payment.amount;
  return person.bills
    .filter((b) => b.amount > 0)
    .map((b): BillPayment => {
      const base = { splitId: b.splitId, personId: b.personId };
      if (left >= b.amount) {
        left -= b.amount;
        return { ...base, kind: "full" };
      }
      if (left > 0) {
        const amount = left;
        left = 0;
        return { ...base, kind: "part", amount };
      }
      return { ...base, kind: "none" };
    });
}
