import { describe, expect, it } from "vitest";
import { newDoc } from "./draft";
import { byTitle, eventPeople, spreadPayment, type EventBill } from "./event";
import type { SplitDoc } from "./types";

const me = { id: "me", name: "Isara" };
const mint = { id: "mint000000000001", name: "Mint" };
const ploy = { id: "ploy000000000001", name: "Ploy" };

function bill(id: string, title: string, people: SplitDoc["people"], price: number, extra: Partial<EventBill> = {}): EventBill {
  return {
    id,
    doc: {
      ...newDoc(),
      title,
      mode: "equal",
      people,
      items: [{ id: "i", name: "x", qty: 1, price, assigned: [] }],
    },
    paid: [],
    partial: {},
    ...extra,
  };
}

describe("big bill: everyone across the bills", () => {
  const food1 = bill("b1", "Food 1", [me, mint, ploy], 30000); // 100 each
  const karaoke = bill("b2", "Karaoke", [me, mint], 40000); // 200 each
  const food2 = bill("b3", "Food 2", [me, { id: "x1", name: "ploy " }, mint], 15000); // 50 each; Ploy typed again

  it("adds each person's amounts, merging by id or (typed names) by name", () => {
    const people = eventPeople([food1, karaoke, food2]);
    expect(people.map((p) => [p.name, p.total, p.bills.length])).toEqual([
      ["Isara", 35000, 3],
      ["Mint", 35000, 3],
      ["Ploy", 15000, 2],
    ]);
    expect(people[0].organiser).toBe(true);
  });

  it("is paid in full only when every bill is; otherwise part-paid", () => {
    const people = eventPeople([
      { ...food1, paid: [mint.id] },
      { ...karaoke, partial: { [mint.id]: 5000 } },
      food2,
    ]);
    const m = people.find((p) => p.name === "Mint")!;
    expect([m.status, m.paidSoFar]).toEqual(["part", 15000]);
    const all = eventPeople([{ ...food1, paid: [mint.id] }, { ...karaoke, paid: [mint.id] }, { ...food2, paid: [mint.id] }]);
    expect(all.find((p) => p.name === "Mint")!.status).toBe("full");
  });

  it("spreads a part payment over the bills in order", () => {
    const m = eventPeople([food1, karaoke, food2]).find((p) => p.name === "Mint")!;
    expect(spreadPayment(m, { kind: "part", amount: 25000 }).map((b) => [b.splitId, b.kind, "amount" in b ? b.amount : null])).toEqual([
      // A–Z: Food 1 (฿100), Food 2 (฿50), then Karaoke (฿200) gets the rest.
      ["b1", "full", null],
      ["b3", "full", null],
      ["b2", "part", 10000],
    ]);
    expect(spreadPayment(m, { kind: "full" }).every((b) => b.kind === "full")).toBe(true);
  });
});

describe("big bill order", () => {
  it("sorts bills A–Z, numbers in order", () => {
    // Thai titles come first (Thai alphabetical order), then English.
    expect(byTitle(["Karaoke", "Food 10", "food 2", "ชาบู"], (t) => t)).toEqual(["ชาบู", "food 2", "Food 10", "Karaoke"]);
  });
});

describe("the organiser in a big bill", () => {
  it("is never ticked, even if an older bill still holds a tick for them", () => {
    const b = bill("b1", "Food", [me, mint], 20000, { paid: ["me"], partial: {} });
    const isara = eventPeople([b]).find((p) => p.organiser)!;
    expect([isara.status, isara.paidSoFar, isara.bills[0].status]).toEqual(["none", 0, "none"]);
  });
});
