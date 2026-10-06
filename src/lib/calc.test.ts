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

describe("rounding to whole baht (optional)", () => {
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

  it("everyone gets whole baht, the organiser too (nearest baht), and the organiser never loses money", () => {
    const r = calculate(base({ people: withMe, items, service: svc, vat, roundUp: true }));
    expect(totals(r)).toEqual([25894, 22363, 22363]); // exact shares unchanged
    // Friends: 447.26 exact → 448 together → 224 + 224.
    // Organiser: 706.20 − 448 = 258.20 left → shown as 258.
    expect(r.people.map((p) => p.payable)).toEqual([25800, 22400, 22400]);
    expect(sum(r.people.map((p) => p.payable))).toBe(70600); // the bill (706.20) to the nearest baht
    expect(r.roundingExtra).toBe(74);
  });

  it("rounds some friends down when that's cheaper, without the organiser losing money", () => {
    const r = calculate(
      base({ people: withMe, items: [item("m", 5000, ["me"]), item("x", 22330, ["b"]), item("y", 22360, ["c"])], roundUp: true }),
    );
    // Exact 223.30 + 223.60 = 446.90 → 447 together: Bee rounds down, Cat rounds up.
    // Organiser: 496.90 − 447 = 49.90 left → rounds up to 50.
    expect(r.people.map((p) => p.payable)).toEqual([5000, 22300, 22400]);
    expect(r.roundingExtra).toBe(10);
  });

  it("split equally: everyone's share is the same whole amount, the organiser's too", () => {
    const three = [{ id: "me", name: "Me" }, { id: "b", name: "Bee" }, { id: "c", name: "Cat" }];
    // ฿1,000.45 three ways: 333.48 / 333.49 exact.
    const r = calculate(base({ mode: "equal", people: three, items: [item("x", 100045, [])], roundUp: true }));
    expect(r.people.map((p) => p.payable)).toEqual([33400, 33400, 33400]);
    // What the organiser really pays (1,000.45 − 668 = 332.45) is less than the ฿334 shown.
    expect(r.total - 66800).toBeLessThanOrEqual(r.people[0].payable);
  });

  it("without an organiser (older splits) the whole bill rounds up to a whole baht", () => {
    const r = calculate(base({ mode: "equal", items: [item("x", 10000, [])], roundUp: true }));
    expect(totals(r)).toEqual([3334, 3333, 3333]);
    expect(r.people.map((p) => p.payable)).toEqual([3400, 3300, 3300]);
    expect(sum(r.people.map((p) => p.payable))).toBe(10000);
  });

  it("is a no-op for zero-decimal currencies", () => {
    const r = calculate({ ...base({ items: [item("x", 1001, ["a"])], roundUp: true }), currency: "JPY" });
    expect(r.people[0].payable).toBe(1001);
  });

  it("the organiser never loses money and friends pay less than ฿1 extra in total (random bills)", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let t = 0; t < 500; t++) {
      const ps = [{ id: "me", name: "Me" }, ...Array.from({ length: 1 + Math.floor(rand() * 8) }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))];
      const its = Array.from({ length: 1 + Math.floor(rand() * 8) }, (_, i) =>
        item(`i${i}`, Math.floor(rand() * 50000), ps.filter(() => rand() < 0.6).map((p) => p.id).concat(ps[0].id)),
      );
      const mode = rand() < 0.3 ? "equal" : "itemized";
      const r = calculate({ mode, people: ps, items: its, discount: noDiscount, service: svc, vat, roundUp: true });
      const me = r.people.find((p) => p.personId === "me")!;
      const friends = r.people.filter((p) => p.personId !== "me");
      const paid = sum(friends.map((p) => p.payable));
      const exact = sum(friends.map((p) => p.total));
      expect(paid).toBeGreaterThanOrEqual(exact); // never lose money
      if (mode === "equal") {
        // Everyone (the organiser too) has the same whole amount, under ฿1 over their share,
        // and the organiser really pays no more than that.
        expect(new Set(r.people.map((p) => p.payable)).size).toBe(1);
        for (const p of r.people) expect(p.payable - p.total).toBeLessThan(100);
        expect(r.total - paid).toBeLessThanOrEqual(me.payable);
        continue;
      } else {
        expect(paid - exact).toBeLessThan(100); // cheapest: under ฿1 in total
      }
      expect(r.total - paid).toBeLessThanOrEqual(me.total); // what the organiser really pays ≤ their share
      expect(Math.abs(me.payable % 100)).toBe(0);
      expect(me.payable).toBeGreaterThanOrEqual(0);
      // Nearest baht (unless friends' rounding up leaves the organiser ahead: then ฿0).
      if (r.total - paid > 0) expect(Math.abs(me.payable - (r.total - paid))).toBeLessThanOrEqual(50);
      for (const p of friends) {
        expect(p.payable % 100).toBe(0);
        expect(Math.abs(p.payable - p.total)).toBeLessThan(100);
      }
      // Everyone's amounts add up to the bill to the nearest baht (unless the
      // organiser's share was held at ฿0 above).
      if (r.total - paid >= 50) expect(sum(r.people.map((p) => p.payable))).toBe(Math.round(r.total / 100) * 100);
    }
  });
});

describe("negative items (a discount printed under one item)", () => {
  it("allocate splits negative amounts exactly", () => {
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(sum(allocate(-10001, [3, 1]))).toBe(-10001);
  });

  it("reduces only the people who shared that item", () => {
    const r = calculate(
      base({
        items: [item("padthai", 12000, ["a"]), item("tomyum", 30000, ["b", "c"]), item("tomyum discount", -3000, ["b", "c"])],
      }),
    );
    expect(r.itemsSubtotal).toBe(39000);
    expect(totals(r)).toEqual([12000, 13500, 13500]);
    expect(sum(totals(r))).toBe(r.total);
  });

  it("works with service, VAT, a receipt-wide discount and rounding", () => {
    const r = calculate({
      ...base({
        people: [{ id: "me", name: "Me" }, ...people.slice(1)],
        items: [item("a", 15000, ["me"]), item("b", 20000, ["b", "c"]), item("b off", -2500, ["b", "c"])],
        discount: { ...noDiscount, enabled: true, value: 1000 },
        service: { enabled: true, rateBp: 1000 },
        vat: { enabled: true, rateBp: 700 },
      }),
      roundUp: true,
    });
    expect(sum(totals(r))).toBe(r.total);
    for (const p of r.people) expect(p.payable % 100).toBe(0);
    for (const p of r.people) expect(p.discount).toBeGreaterThanOrEqual(0);
  });
});

describe("paid upfront (a friend paid part of the bill)", () => {
  const ppl = [
    { id: "me", name: "Me" },
    { id: "b", name: "Bee" },
    { id: "c", name: "Cat" },
  ];
  const its = [item("food", 90000, ["me", "b", "c"]), item("drinks", 30000, ["b", "c"])];

  it("lowers that friend's amount; the organiser's share is unchanged", () => {
    const r = calculate(base({ people: ppl, items: its, prepaid: [{ personId: "b", amount: 30000 }] }));
    expect(totals(r)).toEqual([30000, 45000, 45000]); // exact shares unchanged
    expect(r.people.map((p) => p.prepaid)).toEqual([0, 30000, 0]);
    expect(r.people.map((p) => p.payable)).toEqual([30000, 15000, 45000]);
  });

  it("goes negative when they paid more than their share: the organiser pays them back", () => {
    const r = calculate(base({ people: ppl, items: its, prepaid: [{ personId: "b", amount: 60000 }] }));
    expect(r.people.find((p) => p.personId === "b")!.payable).toBe(-15000);
    // What the organiser collects minus what they pay back = bill − what Bee paid − the organiser's share.
    const friends = r.people.filter((p) => p.personId !== "me");
    expect(sum(friends.map((p) => p.payable))).toBe(r.total - 60000 - 30000);
  });

  it("is ignored for the organiser and for people not in the split", () => {
    const r = calculate(
      base({ people: ppl, items: its, prepaid: [{ personId: "me", amount: 5000 }, { personId: "zz", amount: 5000 }] }),
    );
    expect(r.people.map((p) => p.payable)).toEqual(totals(r));
  });

  it("works with rounding without the organiser losing money", () => {
    const r = calculate(
      base({
        people: ppl,
        items: [item("food", 100000, ["me", "b", "c"]), item("x", 333, ["b"])],
        service: { enabled: true, rateBp: 1000 },
        vat: { enabled: true, rateBp: 700 },
        roundUp: true,
        prepaid: [{ personId: "c", amount: 12345 }],
      }),
    );
    const friends = r.people.filter((p) => p.personId !== "me");
    for (const p of r.people) expect(p.payable % 100).toBe(0);
    const owedExactly = sum(friends.map((p) => p.total - p.prepaid));
    expect(sum(friends.map((p) => p.payable))).toBeGreaterThanOrEqual(owedExactly);
    expect(sum(friends.map((p) => p.payable)) - owedExactly).toBeLessThan(100);
  });
});

describe("uneven shares of one item", () => {
  it("splits by shares: Mint had 2 of the 3 beers", () => {
    const beers = { ...item("beer", 9000, ["a", "b"], 3), shares: { a: 2 } };
    const r = calculate(base({ items: [beers] }));
    expect(totals(r)).toEqual([18000, 9000, 0]);
    expect(r.people[0].items[0]).toMatchObject({ shares: 2, totalShares: 3 });
  });

  it("keeps service, VAT and discounts exact", () => {
    const r = calculate(
      base({
        items: [{ ...item("x", 10001, ["a", "b", "c"]), shares: { a: 3, c: 2 } }, item("y", 4999, ["b"])],
        discount: { ...noDiscount, enabled: true, value: 1500 },
        service: { enabled: true, rateBp: 1000 },
        vat: { enabled: true, rateBp: 700 },
      }),
    );
    expect(sum(totals(r))).toBe(r.total);
    for (const p of r.people) expect(p.discount).toBeGreaterThanOrEqual(0);
  });
});
