import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney, percentToBp } from "./money";

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
