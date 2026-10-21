// "What I owe" (a friend's view across the bills they've opened) and "Owed
// to you" (the organiser's view across their History). Pure.

import { calculate, ORGANISER_ID } from "./calc";
import { billDate } from "./draft";
import { organiserLines, settlesDirectly, transferKey, transfers } from "./settle";
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
  /** what the bill records my payment under (my person id, or the transfer key) */
  ref: string;
  /** who I pay, as a person id in that bill ("me" = the organiser) */
  toId: string;
  bill: LoadedBill;
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
  const base = { billId: bill.id, title: doc.title, date: billDate(doc), currency: doc.currency, href: bill.href, bill };
  const person = (id: string) => doc.people.find((p) => p.id === id);
  const calc = calculate(doc);
  if (settlesDirectly(doc)) {
    return transfers(doc, calc)
      .filter((t) => t.from === me.id)
      .map((t) => {
        const key = transferKey(t.from, t.to);
        const paidPart = bill.partial[key] ?? 0;
        return {
          ...base,
          to: person(t.to) ?? { name: "?" },
          left: bill.paid.includes(key) ? 0 : t.amount - paidPart,
          part: paidPart > 0,
          ref: key,
          toId: t.to,
        };
      })
      .filter((l) => l.left > 0);
  }
  const r = calc.people.find((x) => x.personId === me.id);
  if (!r || r.payable <= 0 || bill.paid.includes(me.id)) return [];
  const paidPart = bill.partial[me.id] ?? 0;
  const left = r.payable - paidPart;
  const organiser = person(ORGANISER_ID) ?? { name: "the organiser" };
  return left > 0 ? [{ ...base, to: organiser, left, part: paidPart > 0, ref: me.id, toId: ORGANISER_ID }] : [];
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

// ---- Who still owes (the organiser's shareable list) -----------------------

export interface BoardPerson {
  key: string;
  look: Look;
  /** how each spelling/look was seen (the most common one is shown) */
  looks?: Map<string, { look: Look; n: number }>;
  total: number;
  bills: { id: string; title: string; date: Date; left: number; part: boolean }[];
}

export interface Board {
  /** the organiser, as they're named in their bills */
  organiser: Look;
  currency: string;
  total: number;
  billCount: number;
  /** A–Z by name */
  people: BoardPerson[];
}

/**
 * Everyone who still owes the organiser across these bills (what's left after
 * part payments; paying payers directly, only what's owed to the organiser),
 * merged by id or name and sorted A–Z, each with their unpaid bills (newest
 * first). One currency: bills in others are left out.
 */
export function whoStillOwes(bills: { id: string; doc: SplitDoc; paid: string[]; partial: Record<string, number> }[]): Board {
  const currency = bills[0]?.doc.currency ?? "THB";
  const people: BoardPerson[] = [];
  const unpaidBills = new Set<string>();
  const names = new Map<string, { look: Look; n: number }>();
  for (const b of bills) {
    if (b.doc.currency !== currency) continue;
    const me = b.doc.people.find((p) => p.id === ORGANISER_ID);
    if (me) {
      const k = norm(me.name);
      names.set(k, { look: me, n: (names.get(k)?.n ?? 0) + 1 });
    }
    for (const line of organiserLines(b.doc, { paid: b.paid, partial: b.partial })) {
      if (line.amount <= 0 || line.status === "full") continue;
      const left = line.amount - line.paidSoFar;
      if (left <= 0) continue;
      const p = b.doc.people.find((x) => x.id === line.personId);
      if (!p) continue;
      let person = people.find((x) => x.key === p.id || norm(x.look.name) === norm(p.name));
      if (!person) {
        person = { key: p.id, look: { name: p.name, emoji: p.emoji, color: p.color }, total: 0, bills: [], looks: new Map() };
        people.push(person);
      }
      const seen = person.looks!.get(p.name) ?? { look: { name: p.name, emoji: p.emoji, color: p.color }, n: 0 };
      seen.n++;
      person.looks!.set(p.name, seen);
      person.total += left;
      person.bills.push({ id: b.id, title: b.doc.title, date: billDate(b.doc), left, part: line.paidSoFar > 0 });
      unpaidBills.add(b.id);
    }
  }
  // Show each person as they're most often written ("Mint" over a typed "mint").
  const capital = (n: string) => (n.charAt(0) !== n.charAt(0).toLocaleLowerCase() ? 1 : 0);
  for (const p of people) {
    p.bills.sort((a, c) => c.date.getTime() - a.date.getTime());
    const best = [...p.looks!.values()].sort((a, c) => c.n - a.n || capital(c.look.name) - capital(a.look.name))[0];
    if (best) p.look = best.look;
    delete p.looks;
  }
  people.sort((a, c) => a.look.name.localeCompare(c.look.name, ["th", "en"], { sensitivity: "base" }));
  const organiser = [...names.values()].sort((a, c) => c.n - a.n)[0]?.look ?? { name: "the organiser" };
  return { organiser, currency, total: people.reduce((s, p) => s + p.total, 0), billCount: unpaidBills.size, people };
}
