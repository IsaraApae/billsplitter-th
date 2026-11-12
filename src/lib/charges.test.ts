import { describe, expect, it } from "vitest";
import { reconcileCharges } from "./charges";

// Items after the bill-wide discount: ฿1,000.
const base = 100000;
const none = { service: null, vat: null, vatIncluded: false };
const run = (read: Parameters<typeof reconcileCharges>[1], total: number | null, rates?: Parameters<typeof reconcileCharges>[4]) =>
  reconcileCharges(base, read, 0, total, rates);

describe("service charge and VAT checked against the printed total", () => {
  it("keeps a reading that adds up", () => {
    expect(run({ service: 10000, vat: 7700, vatIncluded: false }, 117700)).toEqual({
      charges: { service: 10000, vat: 7700, vatIncluded: false },
      note: null,
    });
  });

  it("spots VAT that's already in the prices (Vatable ฿934.58 + VAT ฿65.42 = ฿1,000)", () => {
    const r = run({ service: null, vat: 6542, vatIncluded: false }, 100000);
    expect(r.charges.vatIncluded).toBe(true);
    expect(r.note).toMatch(/already in the prices/);
  });

  it("adds VAT on top when it was read as included but the total says otherwise", () => {
    expect(run({ service: null, vat: null, vatIncluded: true }, 107000).charges).toMatchObject({ vat: 7000, vatIncluded: false, vatBp: 700 });
  });

  it("fills in a missed VAT line, or a missed service charge", () => {
    expect(run({ service: 10000, vat: null, vatIncluded: false }, 117700).charges).toMatchObject({ service: 10000, vat: 7700, vatBp: 700 });
    expect(run({ service: null, vat: 7700, vatIncluded: false }, 117700).charges).toMatchObject({ service: 10000, vat: 7700, serviceBp: 1000 });
  });

  it("works out both from the usual rates, or from the rates printed", () => {
    expect(run(none, 117700).charges).toMatchObject({ service: 10000, vat: 7700, serviceBp: 1000, vatBp: 700 });
    expect(run(none, 110000).charges).toMatchObject({ service: 10000, vat: null });
    // 5% service, 7% VAT: ฿50 + ฿73.50
    expect(run(none, 112350).charges).toMatchObject({ service: 5000, vat: 7350 });
    // A printed 12% service charge, then 7% VAT: ฿120 + ฿78.40
    expect(run(none, 119840, { serviceBp: 1200, vatBp: null }).charges).toMatchObject({ service: 12000, vat: 7840 });
  });

  it("drops a service charge the total doesn't have", () => {
    const r = run({ service: 10000, vat: null, vatIncluded: false }, 100000);
    expect(r.charges).toEqual({ service: null, vat: null, vatIncluded: false });
  });

  it("leaves the reading alone when there's no total, or nothing adds up", () => {
    const read = { service: 10000, vat: null, vatIncluded: false };
    expect(run(read, null)).toEqual({ charges: read, note: null });
    expect(run(read, 123456)).toEqual({ charges: read, note: null });
  });

  it("counts the receipt's rounding line", () => {
    expect(reconcileCharges(base, none, -50, 117650).charges).toMatchObject({ service: 10000, vat: 7700 });
  });
});
