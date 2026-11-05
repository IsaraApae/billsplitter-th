import { describe, expect, it } from "vitest";
import { COMMON_RATES_BP, findDiscountedItems } from "./discountMatch";

const lines = [
  { id: "set", total: 59900 }, // Mookata set ฿599
  { id: "beer", total: 45000 }, // ฿450
  { id: "ice", total: 12000 }, // ฿120
  { id: "rice", total: 4000 }, // ฿40
];

describe("findDiscountedItems", () => {
  it("finds the one item a known rate fits exactly", () => {
    const r = findDiscountedItems(lines, 5990, [1000]);
    expect(r.matches).toEqual([{ ids: ["set"], rateBp: 1000 }]);
  });

  it("finds a combination of items", () => {
    // 10% of ฿450 + ฿120 = ฿57.00
    expect(findDiscountedItems(lines, 5700, [1000]).matches).toEqual([{ ids: ["beer", "ice"], rateBp: 1000 }]);
  });

  it("guesses the rate when only the amount is known", () => {
    // ฿119.80 is 20% of the ฿599 set
    expect(findDiscountedItems(lines, 11980, COMMON_RATES_BP).matches[0]).toEqual({ ids: ["set"], rateBp: 2000 });
  });

  it("allows a satang of rounding either way", () => {
    // 15% of ฿599 = ฿89.85; a receipt might print ฿89.86
    expect(findDiscountedItems(lines, 8986, [1500]).matches[0].ids).toEqual(["set"]);
  });

  it("returns every candidate when several fit", () => {
    const twins = [
      { id: "a", total: 10000 },
      { id: "b", total: 10000 },
    ];
    expect(findDiscountedItems(twins, 1000, [1000]).matches.map((m) => m.ids)).toEqual([["a"], ["b"]]);
  });

  it("finds nothing when no combination fits, and skips discount lines", () => {
    expect(findDiscountedItems(lines, 1234, [1000]).matches).toEqual([]);
    expect(findDiscountedItems([...lines, { id: "coupon", total: -5000 }], 5990, [1000]).matches).toEqual([{ ids: ["set"], rateBp: 1000 }]);
  });

  it("gives up gracefully on a huge bill", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `i${i}`, total: 1000 }));
    const r = findDiscountedItems(many, 5000, [1000]);
    expect(r.truncated).toBe(true);
    expect(r.matches.length).toBeGreaterThan(0);
  });
});
