import { describe, expect, it } from "vitest";
import { receiptMoment } from "./receiptMoment";

const now = new Date("2026-11-10T05:00:00Z");
const iso = (s: string) => new Date(s).toISOString();

describe("the time printed on a receipt", () => {
  it("reads 24-hour, dotted and AM/PM times, in Thailand time", () => {
    expect(receiptMoment("2026-10-29", "11:34", "2026-10-29", now)).toBe(iso("2026-10-29T11:34:00+07:00"));
    expect(receiptMoment("2026-10-29", "13.05", "2026-10-29", now)).toBe(iso("2026-10-29T13:05:00+07:00"));
    expect(receiptMoment("2026-10-29", "1:05 PM", "2026-10-29", now)).toBe(iso("2026-10-29T13:05:00+07:00"));
    expect(receiptMoment("2026-10-29", "12:10 am", "2026-10-29", now)).toBe(iso("2026-10-29T00:10:00+07:00"));
    expect(receiptMoment("2026-10-29", "11:34:52", "2026-10-29", now)).toBe(iso("2026-10-29T11:34:00+07:00"));
  });

  it("takes a Buddhist-era date, or the bill's day when none is printed", () => {
    expect(receiptMoment("2569-10-29", "11:34", "2026-10-29", now)).toBe(iso("2026-10-29T11:34:00+07:00"));
    expect(receiptMoment(null, "20:15", "2026-10-06", now)).toBe(iso("2026-10-06T20:15:00+07:00"));
  });

  it("gives up without a time, on nonsense, in the future, or far from the bill's day", () => {
    expect(receiptMoment("2026-10-29", null, "2026-10-29", now)).toBeNull();
    expect(receiptMoment("2026-10-29", "25:00", "2026-10-29", now)).toBeNull();
    expect(receiptMoment("2026-10-29", "lunch", "2026-10-29", now)).toBeNull();
    expect(receiptMoment("2026-11-10", "23:00", "2026-11-10", now)).toBeNull();
    expect(receiptMoment("2026-08-01", "12:00", "2026-10-29", now)).toBeNull();
  });
});
