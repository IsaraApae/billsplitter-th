import { describe, expect, it } from "vitest";
import { newDoc } from "./draft";
import { daysBetween, duration, namesIn, owedToYou, paidTime, payFrom, payTimes, withoutHidden, withStarts, unpaidPeople, whatIOwe, whoAmI, whoStillOwes, type LoadedBill } from "./owed";
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

describe("who pays fastest", () => {
  const now = Date.parse("2026-10-20T12:00:00+07:00");
  const at = (d: string) => Date.parse(`${d}+07:00`);
  // Made at 8 pm on its own day: friends can pay from then.
  const made = (id: string, title: string, day: string, people: SplitDoc["people"], price: number, extra: Partial<LoadedBill> = {}, paidAt: Record<string, number> = {}) => ({
    ...bill(id, title, people, price, extra, { createdAt: new Date(at(`${day}T20:00:00`)).toISOString(), date: day }),
    paidAt,
  });
  const dinner = made("a", "Dinner", "2026-10-01", [isara, mint, ploy, { id: "bank1", name: "Bank" }], 120000,
    { paid: ["mint01", "ploy01", "bank1"] },
    { mint01: at("2026-10-01T23:30:00"), ploy01: at("2026-10-05T20:00:00") }); // Bank's tick is too old to have a time
  const karaoke = made("b", "Karaoke", "2026-10-10", [isara, { id: "x9", name: "mint " }, ploy], 60000,
    { paid: ["x9"], partial: { ploy01: 5000 } },
    { x9: at("2026-10-12T02:00:00") });

  it("ranks by the average time to pay, from when the bill was made, an unpaid bill counting the time so far", () => {
    const t = payTimes([dinner, karaoke], now);
    expect(t.map((p) => [p.look.name, duration(p.avgMs), p.paid, p.unpaid, p.owed])).toEqual([
      ["Mint", "16 hr", 2, 0, 0], // 3 hr 30 min and 1 day 6 hr: 16.75 hr
      ["Ploy", "6 days 20 hr", 1, 1, 15000], // 4 days, and 9 days 16 hr and counting
    ]);
    const mint = t[0];
    expect([duration(mint.fastestMs!), duration(mint.slowestMs!)]).toEqual(["3 hr 30 min", "1 day 6 hr"]);
    expect(mint.bills.map((b) => [b.title, duration(b.ms), !!b.paidAt])).toEqual([
      ["Karaoke", "1 day 6 hr", true],
      ["Dinner", "3 hr 30 min", true],
    ]);
    expect(duration(t[1].waitingMs)).toBe("9 days 16 hr");
  });

  it("gives the same ranking whatever order the bills come in, ties A–Z", () => {
    const a = made("a", "A", "2026-10-01", [isara, ploy], 20000, { paid: ["ploy01"] }, { ploy01: at("2026-10-02T20:00:00") });
    const b = made("b", "B", "2026-10-05", [isara, mint], 20000, { paid: ["mint01"] }, { mint01: at("2026-10-06T20:00:00") });
    expect(payTimes([a, b], now).map((p) => p.look.name)).toEqual(["Mint", "Ploy"]);
    expect(payTimes([b, a], now).map((p) => p.look.name)).toEqual(["Mint", "Ploy"]);
    expect(payTimes([karaoke, dinner], now)).toEqual(payTimes([dinner, karaoke], now));
  });

  it("starts the clock when the bill was made, or at its day if that's later", () => {
    expect(payFrom({ date: "2026-10-01", createdAt: "2026-10-03T05:00:00Z" })).toBe(Date.parse("2026-10-03T05:00:00Z"));
    expect(payFrom({ date: "2026-10-05", createdAt: "2026-10-03T05:00:00Z" })).toBe(Date.parse("2026-10-05T00:00:00+07:00"));
  });

  it("leaves out the people the organiser hid, by key or by name", () => {
    const t = payTimes([dinner, karaoke], now);
    expect(withoutHidden(t, [{ key: "ploy01", name: "Ploy" }]).map((p) => p.look.name)).toEqual(["Mint"]);
    expect(withoutHidden(t, [{ key: "gone", name: " mint" }]).map((p) => p.look.name)).toEqual(["Ploy"]);
    expect(withoutHidden(t, [])).toBe(t);
  });

  it("counts from when the bill was shared, when the server recorded it", () => {
    // Started on the phone two days before its date (the midnight case), shared at 11:34 that day.
    const late = { ...made("k", "果子", "2026-10-29", [isara, mint], 20000, { paid: ["mint01"] }, { mint01: at("2026-10-29T12:50:00") }), sharedAt: new Date(at("2026-10-29T11:34:00")).toISOString() };
    late.doc.createdAt = new Date(at("2026-10-27T21:48:00")).toISOString();
    expect(payFrom(late.doc, late.sharedAt)).toBe(at("2026-10-29T11:34:00"));
    expect(duration(payTimes([late], now)[0].avgMs)).toBe("1 hr 16 min");
    // Without a share time (bills from before it was kept), the old rule: midnight of its day.
    expect(duration(payTimes([{ ...late, sharedAt: undefined }], now)[0].avgMs)).toBe("12 hr");
  });

  it("uses the organiser's own start time for a bill, over the one kept", () => {
    const b = made("k", "果子", "2026-10-29", [isara, mint], 20000, { paid: ["mint01"] }, { mint01: at("2026-10-29T12:50:00") });
    const set = withStarts([b], { k: new Date(at("2026-10-29T11:34:00")).toISOString() });
    expect(duration(payTimes(set, now)[0].avgMs)).toBe("1 hr 16 min");
    expect(withStarts([b], {})[0]).toBe(b);
  });

  it("takes the slip's time when the slips show the bill was paid before its tick", () => {
    const t = (s: string) => Date.parse(`2026-10-20T${s}+07:00`);
    const slip = (at: string, amount: number) => ({ amount, at: new Date(t(at)).toISOString() });
    // Paid by slip at 13:12, then re-stamped to 17:46 by a later big-bill payment.
    expect(paidTime(t("17:46:13"), [slip("13:12:41", 31185)], 31185)).toBe(t("13:12:41"));
    // The usual case: ticked by the slip, recorded a moment later. The tick stands.
    expect(paidTime(t("13:12:39"), [slip("13:12:41", 31185)], 31185)).toBe(t("13:12:39"));
    // Slips that only paid part: the tick stands.
    expect(paidTime(t("17:46:13"), [slip("13:12:41", 20000)], 31185)).toBe(t("17:46:13"));
    // Two slips that together paid it: the second one's time.
    expect(paidTime(t("18:00:00"), [slip("15:00:00", 11185), slip("13:00:00", 20000)], 31185)).toBe(t("15:00:00"));
    // ฿394 for ฿394.90 counts as paid (rounded down).
    expect(paidTime(t("13:25:53"), [slip("12:49:39", 39400)], 39490)).toBe(t("12:49:39"));
    // No slips, or no tick time but slips that paid it.
    expect(paidTime(t("09:00:00"), undefined, 100)).toBe(t("09:00:00"));
    expect(paidTime(undefined, [slip("13:12:41", 31185)], 31185)).toBe(t("13:12:41"));
  });

  it("writes durations people can read", () => {
    expect([0, 30_000, 35 * 60_000, 5 * 3_600_000 + 20 * 60_000, 7 * 3_600_000 + 5 * 60_000, 86_400_000, 2 * 86_400_000 + 4 * 3_600_000].map(duration)).toEqual([
      "under a minute",
      "under a minute",
      "35 min",
      "5 hr 20 min",
      "7 hr",
      "1 day",
      "2 days 4 hr",
    ]);
  });

  it("counts whole days", () => {
    expect(daysBetween("2026-10-01T12:00:00Z", Date.parse("2026-10-20T12:00:00Z"))).toBe(19);
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
