import { describe, expect, it } from "vitest";
import { COMMON_RATES_BP, findDiscountedItems, isDrink, scanDiscountItems } from "./discountMatch";

const lines = [
  { id: "set", total: 59900 }, // Mookata set ฿599
  { id: "beer", total: 45000 }, // ฿450
  { id: "ice", total: 12000 }, // ฿120
  { id: "rice", total: 4000 }, // ฿40
];

describe("findDiscountedItems", () => {
  it("finds the one item a known rate fits exactly", () => {
    const r = findDiscountedItems(lines, 5990, [1000]);
    expect(r.matches).toEqual([{ ids: ["set"], rateBp: 1000, alternatives: 0 }]);
  });

  it("finds a combination of items", () => {
    // 10% of ฿450 + ฿120 = ฿57.00
    expect(findDiscountedItems(lines, 5700, [1000]).matches).toEqual([{ ids: ["beer", "ice"], rateBp: 1000, alternatives: 0 }]);
  });

  it("guesses the rate when only the amount is known", () => {
    // ฿119.80 is 20% of the ฿599 set
    expect(findDiscountedItems(lines, 11980, COMMON_RATES_BP).matches[0]).toMatchObject({ ids: ["set"], rateBp: 2000 });
  });

  it("allows a satang of rounding either way", () => {
    // 15% of ฿599 = ฿89.85; a receipt might print ฿89.86
    expect(findDiscountedItems(lines, 8986, [1500]).matches[0].ids).toEqual(["set"]);
  });

  it("folds sets that only swap same-priced items into one choice", () => {
    const twins = [
      { id: "a", total: 10000 },
      { id: "b", total: 10000 },
    ];
    expect(findDiscountedItems(twins, 1000, [1000]).matches).toEqual([{ ids: ["a"], rateBp: 1000, alternatives: 1 }]);
  });

  it("keeps your items ticked: a same-priced swap goes your way, your sets come first", () => {
    const twins = [
      { id: "a", total: 10000 },
      { id: "b", total: 10000, mine: true },
    ];
    expect(findDiscountedItems(twins, 1000, [1000]).matches).toEqual([{ ids: ["b"], rateBp: 1000, alternatives: 1 }]);
    const bill = [
      { id: "beer", total: 30000, name: "Singha" },
      { id: "coke", total: 10000, name: "Coke" },
      { id: "pork", total: 25000, name: "หมูสามชั้น", mine: true },
      { id: "egg", total: 15000, name: "Omelette" },
    ];
    expect(findDiscountedItems(bill, 8000, [2000]).matches.map((x) => x.ids)).toEqual([["pork", "egg"], ["beer", "coke"]]);
  });

  it("puts one kind of thing first: the drinks, not a coincidental mix", () => {
    const bill = [
      { id: "beer", total: 30000, name: "Singha" },
      { id: "coke", total: 10000, name: "Coke" },
      { id: "pork", total: 25000, name: "หมูสามชั้น" },
      { id: "egg", total: 15000, name: "Omelette" },
    ];
    // 20% of ฿400 = ฿80: the two drinks (฿300 + ฿100), or pork + egg (฿250 + ฿150)
    const m = findDiscountedItems(bill, 8000, [2000]).matches;
    expect(m.map((x) => x.ids)).toEqual([["beer", "coke"], ["pork", "egg"]]);
  });

  it("finds nothing when no combination fits, and skips discount lines", () => {
    expect(findDiscountedItems(lines, 1234, [1000]).matches).toEqual([]);
    expect(findDiscountedItems([...lines, { id: "coupon", total: -5000 }], 5990, [1000]).matches).toEqual([{ ids: ["set"], rateBp: 1000, alternatives: 0 }]);
  });

  it("gives up gracefully on a huge bill", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `i${i}`, total: 1000 }));
    const r = findDiscountedItems(many, 5000, [1000]);
    expect(r.truncated).toBe(true);
    expect(r.matches.length).toBeGreaterThan(0);
  });
});

describe("isDrink", () => {
  it("knows drinks in Thai and English, and not food that looks similar", () => {
    expect(["Singha", "Leo tower", "เบียร์ช้าง", "ชาเย็น", "Iced latte", "น้ำเปล่า"].every(isDrink)).toBe(true);
    expect(["ชาบู", "น้ำตกหมู", "Ice cream", "Steak", "ข้าวผัด"].some(isDrink)).toBe(false);
  });
});

describe("scanDiscountItems (after a scan)", () => {
  const bill = [
    { id: "beer", total: 30000, name: "Singha" },
    { id: "coke", total: 10000, name: "Coke" },
    { id: "pork", total: 25000, name: "หมูสามชั้น" },
    { id: "egg", total: 15000, name: "Omelette" },
  ];
  it("trusts the receipt's marks when the maths agrees", () => {
    const marked = bill.map((l) => ({ ...l, marked: l.id === "beer" || l.id === "coke" }));
    expect(scanDiscountItems(marked, 8000, 2000)).toEqual({ ids: ["beer", "coke"], from: "receipt", rateBp: 2000 });
  });
  it("ignores marks that don't add up", () => {
    const wrong = bill.map((l) => ({ ...l, marked: l.id === "pork" }));
    expect(scanDiscountItems(wrong, 8000, 2000)).toBeNull(); // two sets fit, so it can't tell
  });
  it("uses the printed rate when only one set fits", () => {
    expect(scanDiscountItems(bill, 6000, 2000)).toEqual({ ids: ["beer"], from: "maths", rateBp: 2000 });
  });
  it("is the whole bill when the rate fits everything", () => {
    expect(scanDiscountItems(bill, 8000, 1000)).toBeNull();
  });
});
