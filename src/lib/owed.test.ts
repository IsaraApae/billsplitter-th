import { describe, expect, it } from "vitest";
import { newDoc } from "./draft";
import { daysBetween, namesIn, owedToYou, paySpeed, unpaidPeople, whatIOwe, whoAmI, whoStillOwes, type HistoryLike, type LoadedBill } from "./owed";
import type { SplitDoc } from "./types";

const isara = { id: "me", name: "Isara" };
const mint = { id: "mint01", name: "Mint" };
const ploy = { id: "ploy01", name: "Ploy" };

function bill(id: string, title: string, people: SplitDoc["people"], price: number, extra: Partial<LoadedBill> = {}, doc: Partial<SplitDoc> = {}): LoadedBill {
  return {
    id,
    href: `/s/${id}`,
    doc: { ...newDoc(), title, mode: "equal", people, items: [{ id: "i", name: "x", qty: 1, price, assigned: [] }], ...doc },
    paid: [],
    partial: {},
    ...extra,
  };
}

describe("what I owe", () => {
  const dinner = bill("b1", "Dinner", [isara, mint, ploy], 90000); // 300 each
  const karaoke = bill("b2", "Karaoke", [isara, { id: "x9", name: "mint " }], 60000, { partial: { x9: 5000 } }); // typed again
  const coffee = bill("b3", "Coffee", [{ id: "me", name: "Boss" }, { id: "m2", name: "Mint" }], 24000, { paid: ["m2"] });

  it("finds me by name (or by who I picked) and never as the organiser", () => {
    expect(whoAmI(dinner.doc, "mint")?.id).toBe("mint01");
    expect(whoAmI(dinner.doc, null, "ploy01")?.id).toBe("ploy01");
    expect(whoAmI(dinner.doc, "Isara")).toBeNull();
  });

  it("adds up what's left per person I owe, skipping what's paid", () => {
    const groups = whatIOwe([dinner, karaoke, coffee], "Mint");
    expect(groups.map((g) => [g.to.name, g.total, g.lines.map((l) => [l.title, l.left, l.part])])).toEqual([
      ["Isara", 55000, [["Dinner", 30000, false], ["Karaoke", 25000, true]]],
    ]);
  });

  it("when friends pay each payer directly, I owe each payer", () => {
    const direct = bill("b4", "BBQ", [isara, mint, ploy], 90000, {}, {
      prepaid: [{ personId: "ploy01", amount: 60000 }],
      settle: "direct",
    });
    // Ploy paid 600 of 900 (300 each): Mint pays Ploy 300; I paid 300 = my share.
    const groups = whatIOwe([direct], "Mint");
    expect(groups.map((g) => [g.to.name, g.total])).toEqual([["Ploy", 30000]]);
  });

  it("lists everyone's names for 'Who are you?'", () => {
    expect(namesIn([dinner, karaoke, coffee]).map((p) => p.name)).toEqual(["Mint", "Ploy"]);
  });
});

describe("owed to you", () => {
  const h = (id: string, title: string, createdAt: string, members: { id: string; name: string; amount: number }[], paidIds: string[] = [], partialPaid = {}) => ({
    id, title, createdAt, currency: "THB", members, paidIds, partialPaid,
  });

  it("totals each friend's unpaid amounts across splits, merging the same name", () => {
    const friends = owedToYou([
      h("a", "Dinner", "2026-10-07", [{ id: "me", name: "Isara", amount: 30000 }, { id: "mint01", name: "Mint", amount: 26700 }, { id: "ploy01", name: "Ploy", amount: 30000 }], ["ploy01"]),
      h("b", "Karaoke", "2026-10-06", [{ id: "me", name: "Isara", amount: 30000 }, { id: "x9", name: "mint", amount: 30000 }], [], { x9: 5000 }),
      h("c", "Food", "2026-10-05", [{ id: "me", name: "Isara", amount: 10000 }, { id: "ploy01", name: "Ploy", amount: -5000 }]),
    ]);
    expect(friends.map((f) => [f.look.name, f.total, f.bills.map((b) => [b.title, b.left, b.part])])).toEqual([
      ["Mint", 51700, [["Dinner", 26700, false], ["Karaoke", 25000, true]]],
    ]);
  });
});

describe("pay speed (who pays fastest)", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const at = (d: string) => Date.parse(d);
  const m = (id: string, name: string, amount = 10000) => ({ id, name, amount });
  const bills: HistoryLike[] = [
    { id: "a", title: "Dinner", createdAt: "2026-10-01T12:00:00Z", currency: "THB",
      members: [m("me", "Isara"), m("mint01", "Mint"), m("ploy01", "Ploy"), m("bank1", "Bank")],
      paidIds: ["mint01", "ploy01", "bank1"],
      paidAt: { mint01: at("2026-10-01T20:00:00Z"), ploy01: at("2026-10-05T12:00:00Z") } }, // Bank's tick is too old to have a time
    { id: "b", title: "Karaoke", createdAt: "2026-10-10T12:00:00Z", currency: "THB",
      members: [m("me", "Isara"), m("x9", "mint"), m("ploy01", "Ploy", 30000)],
      paidIds: ["x9"], paidAt: { x9: at("2026-10-12T12:00:00Z") }, partialPaid: { ploy01: 5000 } },
  ];
  it("ranks by average days to pay, an unpaid bill counting the days so far", () => {
    expect(paySpeed(bills, now).map((p) => [p.look.name, p.days, p.paid, p.unpaid, p.owed, p.waiting])).toEqual([
      ["Mint", 1, 2, 0, 0, 0], // same day and 2 days
      ["Ploy", 7, 1, 1, 25000, 10], // 4 days, and 10 days and counting
    ]);
  });
  it("counts whole days", () => {
    expect(daysBetween("2026-10-01T12:00:00Z", now)).toBe(19);
    expect(daysBetween(now, "2026-10-01")).toBe(0);
  });
});

describe("who still owes (shareable list)", () => {
  it("lists everyone who hasn't paid A–Z, with all their unpaid bills", () => {
    const dinner = bill("b1", "Dinner", [isara, mint, ploy], 90000, { paid: ["ploy01"] });
    const karaoke = bill("b2", "Karaoke", [isara, { id: "x9", name: "mint" }, ploy], 60000, { partial: { x9: 5000 } });
    const board = whoStillOwes([karaoke, dinner]);
    expect(board.organiser.name).toBe("Isara");
    expect(board.people.map((p) => [p.look.name, p.total, p.bills.map((b) => [b.title, b.left, b.part])])).toEqual([
      ["Mint", 45000, [["Karaoke", 15000, true], ["Dinner", 30000, false]]],
      ["Ploy", 20000, [["Karaoke", 20000, false]]],
    ]);
    expect([board.total, board.billCount]).toEqual([65000, 2]);
  });
});

describe("who are you (people who still owe)", () => {
  it("lists only people with something left to pay, across bills, A–Z", () => {
    const dinner = bill("b1", "Dinner", [isara, mint, ploy], 90000, { paid: ["ploy01"] });
    const lunch = bill("b2", "Lunch", [isara, { id: "x1", name: "Bank" }, { id: "x2", name: "ploy" }], 30000, { paid: ["x1", "x2"] });
    expect(unpaidPeople([dinner, lunch]).map((p) => p.name)).toEqual(["Mint"]);
  });
});
