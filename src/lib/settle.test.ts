import { describe, expect, it } from "vitest";
import { newDoc } from "./draft";
import { eventPeople, spreadPayment } from "./event";
import {
  findTransfer,
  organiserLines,
  paidAtRestaurant,
  paymentKeys,
  paymentSummary,
  settlesDirectly,
  transferKey,
  transfers,
} from "./settle";
import type { SplitDoc } from "./types";

const me = { id: "me", name: "Isara" };
const mint = { id: "mint", name: "Mint" };
const ploy = { id: "ploy", name: "Ploy" };
const bank = { id: "bank", name: "Bank" };

/** 4 people, equal split of `total` satang; Mint paid `mintPaid` at the restaurant. */
function doc(total: number, mintPaid: number, extra: Partial<SplitDoc> = {}): SplitDoc {
  return {
    ...newDoc(),
    title: "Dinner",
    mode: "equal",
    people: [me, mint, ploy, bank],
    items: [{ id: "i", name: "Food", qty: 1, price: total, assigned: [] }],
    prepaid: [{ personId: "mint", amount: mintPaid, promptpay: "0812345678" }],
    settle: "direct",
    ...extra,
  };
}

describe("several payers: who pays whom", () => {
  it("I paid the food, Mint paid the drinks: friends pay each payer directly", () => {
    // ฿1,000 bill, ฿250 each. Mint paid ฿400 (the drinks), I paid ฿600.
    const d = doc(100000, 40000);
    expect(settlesDirectly(d)).toBe(true);
    expect(Object.fromEntries(paidAtRestaurant(d))).toEqual({ mint: 40000, me: 60000 });
    const ts = transfers(d);
    // I'm owed ฿350, Mint ฿150; Ploy and Bank owe ฿250 each.
    expect(ts).toEqual([
      { from: "bank", to: "me", amount: 25000 },
      { from: "ploy", to: "me", amount: 10000 },
      { from: "ploy", to: "mint", amount: 15000 },
    ]);
    // Everyone ends up paying exactly their share.
    const net = new Map<string, number>([...paidAtRestaurant(d)]);
    for (const t of ts) {
      net.set(t.from, (net.get(t.from) ?? 0) + t.amount);
      net.set(t.to, (net.get(t.to) ?? 0) - t.amount);
    }
    for (const p of d.people) expect(net.get(p.id) ?? 0).toBe(25000);
  });

  it("the organiser pays back a friend who paid more than the organiser is owed", () => {
    // ฿1,000; Mint paid ฿900: I owe Mint ฿250 too.
    const ts = transfers(doc(100000, 90000));
    expect(ts.find((t) => t.from === "me")).toEqual({ from: "me", to: "mint", amount: 15000 });
    expect(ts.reduce((s, t) => s + (t.to === "mint" ? t.amount : 0), 0)).toBe(65000);
  });

  it("rounds each transfer up to whole baht so payers never lose money", () => {
    // ฿1,000.50 → ฿250.12–250.13 each; Mint paid ฿400, I paid ฿600.50.
    const d = doc(100050, 40000, { roundUp: true });
    const ts = transfers(d);
    expect(ts.every((t) => t.amount % 100 === 0)).toBe(true);
    const received = new Map<string, number>();
    for (const t of ts) received.set(t.to, (received.get(t.to) ?? 0) + t.amount);
    const shares = new Map(transfers({ ...d, roundUp: false }).map((t) => [t.to, 0]));
    for (const t of transfers({ ...d, roundUp: false })) shares.set(t.to, shares.get(t.to)! + t.amount);
    for (const [payer, exact] of shares) expect(received.get(payer)!).toBeGreaterThanOrEqual(exact);
  });

  it("stays the usual way (everyone pays the organiser) unless direct is chosen", () => {
    const d = doc(100000, 40000, { settle: undefined });
    expect(settlesDirectly(d)).toBe(false);
    expect([...paymentKeys(d)].sort()).toEqual(["bank", "me", "mint", "ploy"]);
    expect(organiserLines(d, { paid: [], partial: {} }).map((l) => [l.personId, l.amount])).toEqual([
      ["mint", -15000],
      ["ploy", 25000],
      ["bank", 25000],
    ]);
    // Nobody else paid: nothing to settle directly.
    expect(settlesDirectly(doc(100000, 0))).toBe(false);
  });

  it("payments are recorded per transfer; History and big bills see the organiser's side", () => {
    const d = doc(100000, 40000);
    const keys = paymentKeys(d);
    expect(keys.has(transferKey("ploy", "mint"))).toBe(true);
    expect(findTransfer(d, transferKey("ploy", "mint"))?.amount).toBe(15000);
    expect(findTransfer(d, transferKey("bank", "mint"))).toBeNull();

    const state = { paid: [transferKey("bank", "me"), transferKey("ploy", "mint")], partial: { [transferKey("ploy", "me")]: 4000 } };
    expect(organiserLines(d, state).map((l) => [l.personId, l.amount, l.status, l.paidSoFar])).toEqual([
      ["mint", 0, "full", 0],
      ["ploy", 10000, "part", 4000],
      ["bank", 25000, "full", 25000],
    ]);
    expect(paymentSummary(d, state)).toEqual({
      people: 3,
      paid: 2,
      paidIds: ["mint", "bank"],
      partialPaid: { ploy: 4000 },
    });

    // A big bill ticks Ploy's transfer to me, not Ploy's id.
    const [, , ployPerson] = eventPeople([{ id: "b1", doc: d, paid: [], partial: {} }]).filter((p) => p.name !== "Bank");
    expect(ployPerson.name).toBe("Ploy");
    expect(ployPerson.total).toBe(10000);
    expect(spreadPayment(ployPerson, { kind: "full" })).toEqual([{ splitId: "b1", personId: "t:ploy:me", kind: "full" }]);
  });
});
