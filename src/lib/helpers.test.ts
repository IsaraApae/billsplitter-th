import { describe, expect, it } from "vitest";
import { billDate, billDay, newDoc } from "./draft";
import { formatMoney, parseMoney, percentToBp } from "./money";
import { parseSplitDoc } from "./schema";
import { isValidPromptPayId, normalizePromptPayInput } from "./promptpay";

describe("money", () => {
  it("parses user input into minor units", () => {
    expect(parseMoney("1,234.50", "THB")).toBe(123450);
    expect(parseMoney("฿ 99", "THB")).toBe(9900);
    expect(parseMoney("0.1", "THB")).toBe(10);
    expect(parseMoney("10.005", "THB")).toBe(1001);
    expect(parseMoney("1200", "JPY")).toBe(1200);
    expect(parseMoney(12.34, "USD")).toBe(1234);
    expect(parseMoney("abc", "THB")).toBeNull();
    expect(parseMoney("-5", "THB")).toBeNull();
  });

  it("formats minor units", () => {
    expect(formatMoney(123450, "THB")).toBe("฿1,234.50");
    expect(formatMoney(1200, "JPY")).toBe("¥1,200");
  });

  it("converts percent to basis points", () => {
    expect(percentToBp(7)).toBe(700);
    expect(percentToBp(12.5)).toBe(1250);
  });
});

describe("negative money input (discount lines)", () => {
  it("parses a leading minus only when allowed", () => {
    expect(parseMoney("-30", "THB", true)).toBe(-3000);
    expect(parseMoney("−12.50", "THB", true)).toBe(-1250);
    expect(parseMoney("-30", "THB")).toBeNull();
  });
});

describe("PromptPay number input", () => {
  it.each([
    ["0812345678", "0812345678"],
    ["081-234-5678", "0812345678"],
    ["๐๘๑๒๓๔๕๖๗๘", "0812345678"],
    ["+66 81 234 5678", "0812345678"],
    ["66812345678", "0812345678"],
    ["0066812345678", "0812345678"],
    ["０８１２３４５６７８", "0812345678"],
    ["1-2345-67890-12-3", "1234567890123"],
  ])("%s → %s", (typed, stored) => {
    expect(normalizePromptPayInput(typed)).toBe(stored);
    expect(isValidPromptPayId(normalizePromptPayInput(typed))).toBe(true);
  });

  it("rejects bank account numbers", () => {
    // 10 digits, but not a mobile number: must not become a PromptPay QR.
    for (const acct of ["0123456789", "0451234567", "1234567890", "123-4-56789-0"]) {
      expect(isValidPromptPayId(normalizePromptPayInput(acct))).toBe(false);
    }
    for (const mobile of ["0612345678", "0812345678", "0912345678"]) expect(isValidPromptPayId(mobile)).toBe(true);
  });

  it("leaves IDs that only look international alone", () => {
    // 13-digit national IDs can start with 66; they must not be rewritten.
    expect(normalizePromptPayInput("6612345678901")).toBe("6612345678901");
    expect(normalizePromptPayInput("1234567890123456")).toBe("123456789012345");
  });
});

describe("bill date", () => {
  it("defaults to the day the split was started", () => {
    const doc = newDoc();
    const started = new Date(doc.createdAt);
    expect(billDay(doc)).toBe(
      `${started.getFullYear()}-${String(started.getMonth() + 1).padStart(2, "0")}-${String(started.getDate()).padStart(2, "0")}`,
    );
  });

  it("uses the picked date, at local midnight", () => {
    const d = billDate({ ...newDoc(), date: "2026-09-28" });
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 8, 28, 0]);
  });

  it("is saved with the split, and rejects junk", () => {
    const valid = {
      ...newDoc(),
      people: [{ id: "me", name: "Me" }],
      items: [{ id: "i1", name: "Rice", qty: 1, price: 5000, assigned: ["me"] }],
    };
    const ok = parseSplitDoc({ ...valid, date: "2026-09-28" });
    expect(ok.ok ? ok.doc.date : ok.error).toBe("2026-09-28");
    expect(parseSplitDoc({ ...valid, date: "28/09/2026" }).ok).toBe(false);
  });
});
