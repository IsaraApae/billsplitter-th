import { describe, expect, it } from "vitest";
import { checkSlip, firstName, receiverCheck, sanitizeSlip, type SlipRead } from "./slip";

const now = new Date(2026, 9, 6, 20);
const slip = (over: Partial<SlipRead> = {}): SlipRead => ({
  isSlip: true,
  amount: 220,
  date: "2026-10-06",
  reference: "016279123456789ABC",
  senderName: "นางสาว มิ้นท์ ส.",
  receiverName: "นาย อิสรา อ.",
  receiverAccount: "xxx-x-x5678-x",
  bank: "KBank",
  ...over,
});
const opts = { billDay: "2026-10-06", currency: "THB", organiser: { slipName: "ISARA A. / อิสรา อ." } };

describe("slip reading", () => {
  it("cleans the model output and converts Buddhist-era dates", () => {
    const s = sanitizeSlip({ isSlip: true, amount: "1,250.50", date: "2569-10-06", reference: " 0162 7912 3456 ", receiverName: "นาย อิสรา อ." }, now);
    expect([s.amount, s.date, s.reference]).toEqual([1250.5, "2026-10-06", "0162 7912 3456"]);
  });

  it("matches first names without titles, in Thai or English", () => {
    expect(firstName("นาย อิสรา อ.")).toBe("อิสรา");
    expect(firstName("MR. ISARA A")).toBe("isara");
    expect(receiverCheck(slip(), { slipName: "อิสรา อภิชาติ" })).toBe("match");
    expect(receiverCheck(slip({ receiverName: "MR ISARA APAE" }), { slipName: "Isara A." })).toBe("match");
    expect(receiverCheck(slip({ receiverName: "นาย สมชาย ใ." }), { slipName: "อิสรา" })).toBe("mismatch");
    expect(receiverCheck(slip({ receiverAccount: "xxx-xxx-5678" }), { promptpay: "0812345678" })).toBe("match");
    expect(receiverCheck(slip(), {})).toBe("unknown");
    // A Thai name on the slip can't be compared with only an English name saved.
    expect(receiverCheck(slip(), { slipName: "Isara A." })).toBe("unknown");
    expect(receiverCheck(slip(), { slipName: "Isara A. / อิสรา" })).toBe("match");
  });
});

describe("slip checks", () => {
  it("accepts a good slip (amount in minor units, reference normalised)", () => {
    expect(checkSlip(slip({ reference: "0162-7912 3456" }), { ...opts, organiser: { slipName: "อิสรา" } })).toEqual({
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

  it("rejects slips paid to someone else", () => {
    expect(checkSlip(slip({ receiverName: "นาย สมชาย ใ." }), { ...opts, organiser: { slipName: "อิสรา" } })).toEqual({
      ok: false,
      reason: "This slip was paid to someone else.",
    });
  });
});
