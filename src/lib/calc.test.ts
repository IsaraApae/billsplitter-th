import { describe, expect, it } from "vitest";
import { allocate, applyBp, calculate, type CalcInput } from "./calc";
import type { Discount, Item } from "./types";

const noDiscount: Discount = { enabled: false, type: "percent", value: 0, scope: "all", itemIds: [] };
const off = { enabled: false, rateBp: 0 };
const people = [
  { id: "a", name: "Ann" },
  { id: "b", name: "Bee" },
  { id: "c", name: "Cat" },
];

function item(id: string, price: number, assigned: string[], qty = 1): Item {
  return { id, name: id, qty, price, assigned };
}

function base(over: Partial<CalcInput> = {}): CalcInput {
  return {
    mode: "itemized",
    people,
    items: [
      item("padthai", 12000, ["a"]),
      item("tomyum", 30000, ["a", "b", "c"]),
      item("beer", 9000, ["b", "c"], 2),
    ],
    discount: noDiscount,
    service: off,
    vat: off,
    ...over,
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const totals = (r: ReturnType<typeof calculate>) => r.people.map((p) => p.total);

describe("allocate", () => {
  it("sums exactly and gives leftovers to the largest remainders", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(100, [1, 1, 1], 1)).toEqual([33, 34, 33]);
    expect(allocate(10, [1, 2])).toEqual([3, 7]);
    expect(allocate(5, [0, 0])).toEqual([3, 2]);
    expect(allocate(0, [1, 2, 3])).toEqual([0, 0, 0]);
  });

  it("does not overflow on large amounts", () => {
    const parts = allocate(9_000_000_000, [3_000_000_001, 2_999_999_999, 7]);
    expect(sum(parts)).toBe(9_000_000_000);
  });
});

describe("applyBp", () => {
  it("rounds half up", () => {
    expect(applyBp(66000, 700)).toBe(4620);
    expect(applyBp(150, 1000)).toBe(15);
    expect(applyBp(5, 1000)).toBe(1); // 0.5 -> 1
    expect(applyBp(4, 1000)).toBe(0);
  });
});

describe("equal split", () => {
  it("everyone pays the same, remainder spread one unit at a time", () => {
    const r = calculate(base({ mode: "equal", items: [item("x", 10000, [])] }));
    expect(r.total).toBe(10000);
    expect(totals(r)).toEqual([3334, 3333, 3333]);
    expect(sum(totals(r))).toBe(r.total);
  });

  it("ignores item assignments and keeps totals within one unit with service + VAT", () => {
    const r = calculate(
      base({ mode: "equal", service: { enabled: true, rateBp: 1000 }, vat: { enabled: true, rateBp: 700 } }),
    );
    // 600.00 → service 60.00 → VAT 7% of 660.00 = 46.20 → 706.20
    expect(r.total).toBe(70620);
    expect(sum(totals(r))).toBe(70620);
    expect(Math.max(...totals(r)) - Math.min(...totals(r))).toBeLessThanOrEqual(1);
    expect(r.unassignedItemIds).toEqual([]);
    for (const p of r.people) expect(p.discounted + p.service + p.vat).toBe(p.total);
  });
});

describe("itemized split", () => {
  it("splits shared items evenly among the people who shared them", () => {
    const r = calculate(base());
    expect(r.itemsSubtotal).toBe(60000);
    expect(totals(r)).toEqual([22000, 19000, 19000]);
    const bee = r.people[1];
    expect(bee.items.map((i) => [i.itemId, i.sharedBy, i.amount])).toEqual([
      ["tomyum", 3, 10000],
      ["beer", 2, 9000],
    ]);
    expect(r.complete).toBe(true);
  });

  it("uneven shared item still sums exactly", () => {
    const r = calculate(base({ items: [item("x", 10001, ["a", "b", "c"])] }));
    expect(sum(totals(r))).toBe(10001);
  });

  it("allocates service and VAT proportionally to each person's discounted subtotal", () => {
    const r = calculate(
      base({ service: { enabled: true, rateBp: 1000 }, vat: { enabled: true, rateBp: 700 } }),
    );
    expect(r.service).toBe(6000);
    expect(r.vat).toBe(4620);
    expect(r.people.map((p) => p.service)).toEqual([2200, 1900, 1900]);
    expect(r.people.map((p) => p.vat)).toEqual([1694, 1463, 1463]);
    expect(sum(totals(r))).toBe(r.total);
  });

  it("flags unassigned items and blocks completion", () => {
    const r = calculate(base({ items: [item("x", 100, ["a"]), item("y", 200, []), item("z", 50, ["ghost"])] }));
    expect(r.unassignedItemIds).toEqual(["y", "z"]);
    expect(r.complete).toBe(false);
  });
});

describe("discount", () => {
  it("percent discount on all items", () => {
    const r = calculate(base({ discount: { ...noDiscount, enabled: true, value: 1000 } }));
    expect(r.discount).toBe(6000);
    expect(r.discountedSubtotal).toBe(54000);
    expect(sum(totals(r))).toBe(54000);
  });

  it("percent discount on selected items only", () => {
    const r = calculate(
      base({ discount: { enabled: true, type: "percent", value: 1000, scope: "selected", itemIds: ["tomyum"] } }),
    );
    expect(r.lines.map((l) => l.discount)).toEqual([0, 3000, 0]);
    // Tom yum's 30.00 discount is shared by all three.
    expect(totals(r)).toEqual([21000, 18000, 18000]);
  });

  it("fixed discount on selected items is spread by line value", () => {
    const r = calculate(
      base({ discount: { enabled: true, type: "fixed", value: 5000, scope: "selected", itemIds: ["padthai", "beer"] } }),
    );
    expect(r.lines.map((l) => l.discount)).toEqual([2000, 0, 3000]);
    expect(r.people.map((p) => p.discount)).toEqual([2000, 1500, 1500]);
    expect(sum(totals(r))).toBe(55000);
  });

  it("fixed discount never exceeds the eligible amount", () => {
    const r = calculate(
      base({ discount: { enabled: true, type: "fixed", value: 999999, scope: "selected", itemIds: ["padthai"] } }),
    );
    expect(r.discount).toBe(12000);
    expect(r.people[0].total).toBe(10000);
  });

  it("service and VAT are computed on the discounted subtotal", () => {
    const r = calculate(
      base({
        discount: { ...noDiscount, enabled: true, value: 1000 },
        service: { enabled: true, rateBp: 1000 },
        vat: { enabled: true, rateBp: 700 },
      }),
    );
    expect(r.discountedSubtotal).toBe(54000);
    expect(r.service).toBe(5400);
    expect(r.vat).toBe(applyBp(59400, 700));
    expect(r.total).toBe(54000 + 5400 + 4158);
  });
});

describe("service / VAT toggles", () => {
  const svc = { enabled: true, rateBp: 1000 };
  const vat = { enabled: true, rateBp: 700 };

  it("both off", () => {
    const r = calculate(base());
    expect([r.service, r.vat, r.total]).toEqual([0, 0, 60000]);
  });

  it("service on, VAT off", () => {
    const r = calculate(base({ service: svc }));
    expect([r.service, r.vat, r.total]).toEqual([6000, 0, 66000]);
  });

  it("service off, VAT on (VAT on subtotal only)", () => {
    const r = calculate(base({ vat }));
    expect([r.service, r.vat, r.total]).toEqual([0, 4200, 64200]);
  });

  it("both on", () => {
    const r = calculate(base({ service: svc, vat }));
    expect([r.service, r.vat, r.total]).toEqual([6000, 4620, 70620]);
  });

  it("disabled toggle ignores its rate", () => {
    const r = calculate(base({ service: { enabled: false, rateBp: 1000 }, vat: { enabled: false, rateBp: 700 } }));
    expect(r.total).toBe(60000);
  });

  it("custom rates", () => {
    const r = calculate(base({ service: { enabled: true, rateBp: 1250 }, vat: { enabled: true, rateBp: 1000 } }));
    expect(r.service).toBe(7500);
    expect(r.vat).toBe(6750);
  });
});

describe("rounding always sums exactly to the grand total", () => {
  // Small deterministic PRNG so failures are reproducible.
  function rng(seed: number) {
    return () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  it("holds across 2,000 random bills", () => {
    const rand = rng(42);
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    for (let t = 0; t < 2000; t++) {
      const ps = Array.from({ length: int(1, 9) }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
      const items = Array.from({ length: int(1, 12) }, (_, i) => {
        const assigned = ps.filter(() => rand() < 0.5).map((p) => p.id);
        return item(`i${i}`, int(0, 99999), assigned.length ? assigned : [ps[0].id], int(1, 4));
      });
      const mode = rand() < 0.3 ? "equal" : "itemized";
      const input: CalcInput = {
        mode,
        people: ps,
        items,
        discount: {
          enabled: rand() < 0.6,
          type: rand() < 0.5 ? "percent" : "fixed",
          value: int(0, 5000),
          scope: rand() < 0.5 ? "all" : "selected",
          itemIds: items.filter(() => rand() < 0.5).map((i) => i.id),
        },
        service: { enabled: rand() < 0.7, rateBp: int(0, 2000) },
        vat: { enabled: rand() < 0.7, rateBp: int(0, 1500) },
      };
      const r = calculate(input);
      expect(r.itemsSubtotal - r.discount + r.service + r.vat).toBe(r.total);
      expect(sum(totals(r))).toBe(r.total);
      expect(sum(r.people.map((p) => p.service))).toBe(r.service);
      expect(sum(r.people.map((p) => p.vat))).toBe(r.vat);
      expect(sum(r.people.map((p) => p.discount))).toBe(r.discount);
      for (const p of r.people) {
        expect(p.discount).toBeGreaterThanOrEqual(0);
        expect(p.subtotal - p.discount).toBe(p.discounted);
        expect(p.discounted + p.service + p.vat).toBe(p.total);
        expect(Number.isInteger(p.total)).toBe(true);
      }
      if (mode === "equal") {
        expect(Math.max(...totals(r)) - Math.min(...totals(r))).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("round up (optional, to the nearest whole unit)", () => {
  const svc = { enabled: true, rateBp: 1000 };
  const vat = { enabled: true, rateBp: 700 };
  const withMe = [
    { id: "me", name: "Me" },
    { id: "b", name: "Bee" },
    { id: "c", name: "Cat" },
  ];
  const items = [
    item("padthai", 12000, ["me"]),
    item("tomyum", 30000, ["me", "b", "c"]),
    item("beer", 9000, ["b", "c"], 2),
  ];

  it("is off by default: everyone pays the exact share", () => {
    const r = calculate(base({ people: withMe, items, service: svc, vat }));
    expect(r.people.map((p) => p.payable)).toEqual(totals(r));
    expect(r.roundingExtra).toBe(0);
  });

  it("rounds everyone, including the organiser, up to the next ฿1", () => {
    const r = calculate(base({ people: withMe, items, service: svc, vat, roundUp: true }));
    expect(totals(r)).toEqual([25894, 22363, 22363]); // exact shares unchanged
    expect(r.people.map((p) => p.payable)).toEqual([25900, 22400, 22400]);
    expect(r.total).toBe(70620); // the bill itself is unchanged
    // Only what the others pay extra counts toward the organiser.
    expect(r.roundingExtra).toBe(37 + 37);
  });

  it("leaves whole amounts alone and never rounds down", () => {
    const r = calculate(base({ items: [item("x", 30000, ["a"]), item("y", 0, ["b"]), item("z", 12301, ["c"])], roundUp: true }));
    expect(r.people.map((p) => p.payable)).toEqual([30000, 0, 12400]);
  });

  it("uses the currency's whole unit (no-op for zero-decimal currencies)", () => {
    const usd = calculate({ ...base({ items: [item("x", 1001, ["a"])], roundUp: true }), currency: "USD" });
    expect(usd.people[0].payable).toBe(1100);
    const jpy = calculate({ ...base({ items: [item("x", 1001, ["a"])], roundUp: true }), currency: "JPY" });
    expect(jpy.people[0].payable).toBe(1001);
  });

  it("the organiser never loses money (random bills)", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let t = 0; t < 500; t++) {
      const ps = [{ id: "me", name: "Me" }, ...Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))];
      const its = Array.from({ length: 1 + Math.floor(rand() * 8) }, (_, i) =>
        item(`i${i}`, Math.floor(rand() * 50000), ps.filter(() => rand() < 0.6).map((p) => p.id).concat(ps[0].id)),
      );
      const r = calculate({ mode: rand() < 0.3 ? "equal" : "itemized", people: ps, items: its, discount: noDiscount, service: svc, vat, roundUp: true });
      const others = r.people.filter((p) => p.personId !== "me");
      // What the organiser collects is never less than the others' exact shares.
      expect(sum(others.map((p) => p.payable))).toBeGreaterThanOrEqual(sum(others.map((p) => p.total)));
      for (const p of r.people) {
        expect(p.payable).toBeGreaterThanOrEqual(p.total);
        expect(p.payable % 100).toBe(0);
        expect(p.payable - p.total).toBeLessThan(100); // cheapest: under ฿1 each
      }
      expect(sum(r.people.map((p) => p.total))).toBe(r.total);
    }
  });
});
