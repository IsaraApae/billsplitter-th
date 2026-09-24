import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney, percentToBp } from "./money";
import { parseReceiptText } from "./ocrParse";
import { crc16, isValidPromptPayId, promptPayPayload } from "./promptpay";

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

describe("promptpay", () => {
  it("uses CRC-16/CCITT-FALSE", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("builds a phone-number payload with amount", () => {
    const p = promptPayPayload("081-234-5678", 15050);
    expect(p).toContain("0016A000000677010111");
    expect(p).toContain("01130066812345678");
    expect(p).toContain("5406150.50");
    expect(p).toContain("010212");
    expect(p.slice(-8, -4)).toBe("6304");
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });

  it("builds a static national-ID payload", () => {
    const p = promptPayPayload("1234567890123");
    expect(p).toContain("02131234567890123");
    expect(p).toContain("010211");
    expect(p).not.toContain("5406");
  });

  it("validates ids", () => {
    expect(isValidPromptPayId("0812345678")).toBe(true);
    expect(isValidPromptPayId("1234567890123")).toBe(true);
    expect(isValidPromptPayId("12345")).toBe(false);
  });
});

describe("OCR text parser", () => {
  it("extracts items and printed totals from English and Thai lines", () => {
    const text = [
      "SOMTAM HOUSE",
      "Table 5   Date 12/09/2026",
      "Pad Thai Goong      120.00",
      "2 x Singha Beer     180.00",
      "ต้มยำกุ้ง            300.00",
      "Sticky rice x3       30.00",
      "Subtotal            630.00",
      "Service Charge 10%   63.00",
      "VAT 7%               48.51",
      "Total               741.51",
      "Cash               1000.00",
      "Change              258.49",
    ].join("\n");
    const r = parseReceiptText(text);
    expect(r.items).toEqual([
      { name: "Pad Thai Goong", qty: 1, price: 120 },
      { name: "Singha Beer", qty: 2, price: 180 },
      { name: "ต้มยำกุ้ง", qty: 1, price: 300 },
      { name: "Sticky rice", qty: 3, price: 30 },
    ]);
    expect(r.subtotal).toBe(630);
    expect(r.serviceCharge).toBe(63);
    expect(r.vat).toBe(48.51);
    expect(r.total).toBe(741.51);
  });
});
