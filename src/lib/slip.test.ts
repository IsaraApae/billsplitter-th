import { describe, expect, it } from "vitest";
import { checkSlip, fitsShare, receiverCheck, sanitizeSlip, slipMatches, slipMoment, type SlipRead } from "./slip";

const now = new Date(2026, 9, 6, 20);
const slip = (over: Partial<SlipRead> = {}): SlipRead => ({
  isSlip: true,
  amount: 220,
  date: "2026-10-06",
  time: "19:45",
  reference: "016279123456789ABC",
  senderName: "นางสาว มิ้นท์ ส.",
  receiverName: "นาย อิสรา อ.",
  receiverAccount: "xxx-x-x5678-x",
  bank: "KBank",
  ...over,
});
const opts = { billDay: "2026-10-06", currency: "THB", organiser: { promptpay: "0812345678" } };

describe("when a slip's money was sent", () => {
  it("reads the printed time, and puts it on the printed day in Thailand", () => {
    expect(sanitizeSlip({ isSlip: true, date: "2569-10-06", time: "7:45 PM" }, now).time).toBe("19:45");
    expect(sanitizeSlip({ isSlip: true, date: "2026-10-06", time: "19.45.12" }, now).time).toBe("19:45");
    expect(sanitizeSlip({ isSlip: true, date: "2026-10-06", time: "evening" }, now).time).toBeNull();
    expect(slipMoment("2026-10-06", "19:45", Date.parse("2026-10-07T00:00:00Z"))).toBe("2026-10-06T12:45:00.000Z");
    expect(slipMoment("2026-10-06", null)).toBeNull();
    expect(slipMoment("2026-10-06", "19:45", Date.parse("2026-10-06T12:00:00Z"))).toBeNull(); // not yet: a misread
  });

  it("keeps a slip for someone already ticked only if it's for what they owed", () => {
    expect(fitsShare(30000, 30000, 30000)).toBe(true);
    expect(fitsShare(29950, 30000, 30000)).toBe(true); // rounded down by under ฿1
    expect(fitsShare(10000, 10000, 30000)).toBe(true); // the rest of it, after an earlier slip
    expect(fitsShare(12000, 30000, 30000)).toBe(false); // part of another bill's money
    expect(fitsShare(90000, 30000, 30000)).toBe(false); // several bills at once
  });
});

describe("slip reading", () => {
  it("cleans the model output and converts Buddhist-era dates", () => {
    const s = sanitizeSlip({ isSlip: true, amount: "1,250.50", date: "2569-10-06", reference: " 0162 7912 3456 ", receiverName: "นาย อิสรา อ." }, now);
    expect([s.amount, s.date, s.reference]).toEqual([1250.5, "2026-10-06", "0162 7912 3456"]);
  });

  it("matches the receiver by the visible digits of their PromptPay", () => {
    expect(receiverCheck(slip({ receiverAccount: "xxx-xxx-5678" }), { promptpay: "0812345678" })).toBe("match");
    expect(receiverCheck(slip({ receiverAccount: "xxx-xxx-9999" }), { promptpay: "0812345678" })).toBe("unknown");
    expect(receiverCheck(slip(), {})).toBe("unknown");
  });
});

describe("slipMatches (trusting a quick read)", () => {
  it("passes a good slip for exactly what's owed", () => expect(slipMatches(slip(), opts, 22000)).toBe(true));
  it("waits on a part payment or a misread digit", () => {
    expect(slipMatches(slip({ amount: 100 }), opts, 22000)).toBe(false);
    expect(slipMatches(slip({ amount: 2200 }), opts, 22000)).toBe(false);
  });
  it("waits on a slip that fails the usual checks, even with the right amount", () => {
    expect(slipMatches(slip({ isSlip: false }), opts, 22000)).toBe(false);
    expect(slipMatches(slip({ date: "2026-10-01" }), opts, 22000)).toBe(false); // before the bill
    expect(slipMatches(slip({ reference: null }), opts, 22000)).toBe(false);
  });
});

describe("slip checks", () => {
  it("accepts a good slip (amount in minor units, reference normalised)", () => {
    expect(checkSlip(slip({ reference: "0162-7912 3456", receiverAccount: "xxx-xxx-5678" }), opts)).toEqual({
      ok: true,
      amount: 22000,
      reference: "016279123456",
      receiver: "match",
    });
  });

  it("rejects what isn't a slip, unreadable amounts or references", () => {
    expect(checkSlip(slip({ isSlip: false }), opts).ok).toBe(false);
    expect(checkSlip(slip({ amount: null }), opts).ok).toBe(false);
    expect(checkSlip(slip({ reference: "12" }), opts).ok).toBe(false);
  });

  it("rejects slips dated before the bill", () => {
    const r = checkSlip(slip({ date: "2026-10-05" }), opts);
    expect(r).toMatchObject({ ok: false });
    expect(checkSlip(slip({ date: "2026-10-07" }), opts).ok).toBe(true); // paid the next day
  });
});
