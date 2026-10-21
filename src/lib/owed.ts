// "What I owe" (a friend's view across the bills they've opened) and "Owed
// to you" (the organiser's view across their History). Pure.

import { calculate, ORGANISER_ID } from "./calc";
import { billDate } from "./draft";
import { settlesDirectly, transferKey, transfers } from "./settle";
import type { Person, SplitDoc } from "./types";

type Look = Pick<Person, "name" | "emoji" | "color">;

const norm = (s: string) => s.normalize("NFC").trim().toLocaleLowerCase();

// ---- What I owe ------------------------------------------------------------

/** A bill as loaded from the server, with its payments. */
export interface LoadedBill {
  id: string;
  doc: SplitDoc;
  paid: string[];
  partial: Record<string, number>;
  /** where to open it (the bill, or the big bill it came from) */
  href: string;
}

export interface OweLine {
  billId: string;
  title: string;
  /** YYYY-MM-DD-ish date for sorting and display */
  date: Date;
  currency: string;
  /** who they pay */
  to: Look;
  /** still to pay (minor units, > 0) */
  left: number;
  /** paid part of it already */
  part: boolean;
  href: string;
}

export interface OweGroup {
  to: Look;
  currency: string;
  total: number;
  lines: OweLine[];
}

/**
 * Which person "I" am in a bill: the one picked there before (`picked`), or
 * the person with my name. Never the organiser (that's the bill's owner).
 */
export function whoAmI(doc: SplitDoc, name: string | null, picked?: string): Person | null {
  const people = doc.people.filter((p) => p.id !== ORGANISER_ID);
  const byPick = picked ? people.find((p) => p.id === picked) : undefined;
  if (byPick) return byPick;
  if (!name?.trim()) return null;
  return people.find((p) => norm(p.name) === norm(name)) ?? null;
}

/** What "I" still owe in one bill: to the organiser, or (paying payers directly) to each payer. */
export function oweLines(bill: LoadedBill, me: Person): OweLine[] {
  const { doc } = bill;
  const base = { billId: bill.id, title: doc.title, date: billDate(doc), currency: doc.currency, href: bill.href };
  const person = (id: string) => doc.people.find((p) => p.id === id);
  const calc = calculate(doc);
  if (settlesDirectly(doc)) {
    return transfers(doc, calc)
      .filter((t) => t.from === me.id)
      .map((t) => {
        const key = transferKey(t.from, t.to);
        const paidPart = bill.partial[key] ?? 0;
        return { ...base, to: person(t.to) ?? { name: "?" }, left: bill.paid.includes(key) ? 0 : t.amount - paidPart, part: paidPart > 0 };
      })
      .filter((l) => l.left > 0);
  }
  const r = calc.people.find((x) => x.personId === me.id);
  if (!r || r.payable <= 0 || bill.paid.includes(me.id)) return [];
  const paidPart = bill.partial[me.id] ?? 0;
  const left = r.payable - paidPart;
  const organiser = person(ORGANISER_ID) ?? { name: "the organiser" };
  return left > 0 ? [{ ...base, to: organiser, left, part: paidPart > 0 }] : [];
}

/** Everything "I" owe across bills, grouped by who I pay (largest first). */
export function whatIOwe(bills: LoadedBill[], name: string | null, picks: Record<string, string> = {}): OweGroup[] {
  const groups = new Map<string, OweGroup>();
  for (const bill of bills) {
    const me = whoAmI(bill.doc, name, picks[bill.id]);
    if (!me) continue;
    for (const line of oweLines(bill, me)) {
      const k = `${norm(line.to.name)}|${line.currency}`;
      const g = groups.get(k) ?? { to: line.to, currency: line.currency, total: 0, lines: [] };
      g.total += line.left;
      g.lines.push(line);
      groups.set(k, g);
    }
  }
  for (const g of groups.values()) g.lines.sort((a, b) => b.date.getTime() - a.date.getTime());
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

/** Everyone (not the organiser) in these bills, by name, for "Who are you?". */
export function namesIn(bills: LoadedBill[]): Look[] {
  const seen = new Map<string, Look>();
  for (const b of bills) for (const p of b.doc.people) if (p.id !== ORGANISER_ID && !seen.has(norm(p.name))) seen.set(norm(p.name), p);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, ["th", "en"]));
}

// ---- Owed to you -----------------------------------------------------------

/** What History keeps about a split (see HistoryEntry). */
export interface HistoryLike {
  id: string;
  title: string;
  createdAt: string;
  currency: string;
  members?: (Look & { id: string; amount?: number })[];
  paidIds?: string[];
  partialPaid?: Record<string, number>;
}

export interface OwedFriend {
  /** a friend's id (the first seen); same name across splits counts as one person */
  key: string;
  look: Look;
  currency: string;
  total: number;
  bills: { id: string; title: string; date: string; left: number; part: boolean }[];
}

/** Friends who still owe you, across your splits (largest first). */
export function owedToYou(entries: HistoryLike[]): OwedFriend[] {
  const friends: OwedFriend[] = [];
  const find = (m: { id: string; name: string }, currency: string) =>
    friends.find(
      (f) => f.currency === currency && (f.key === m.id || norm(f.look.name) === norm(m.name)),
    );
  for (const h of entries) {
    for (const m of h.members ?? []) {
      if (m.id === ORGANISER_ID || m.amount === undefined || m.amount <= 0 || h.paidIds?.includes(m.id)) continue;
      const paidPart = h.partialPaid?.[m.id] ?? 0;
      const left = m.amount - paidPart;
      if (left <= 0) continue;
      let f = find(m, h.currency);
      if (!f) {
        f = { key: m.id, look: { name: m.name, emoji: m.emoji, color: m.color }, currency: h.currency, total: 0, bills: [] };
        friends.push(f);
      }
      f.total += left;
      f.bills.push({ id: h.id, title: h.title, date: h.createdAt, left, part: paidPart > 0 });
    }
  }
  for (const f of friends) f.bills.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return friends.sort((a, b) => b.total - a.total);
}
