import { receiptDate } from "./scanResult";

/**
 * The moment printed on a receipt, as an ISO time in Thailand, from the date and time a reader
 * found on it. The time is required ("HH:MM", 24-hour; "13.05" and "1:05 PM" are understood);
 * without a printed date the bill's own day is used. Null when there's no usable time, or the
 * moment is in the future or more than a week from the bill's day (a misread).
 */
export function receiptMoment(date: unknown, time: unknown, billDay: string, now = new Date()): string | null {
  if (typeof time !== "string") return null;
  const m = /^\s*(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*([ap]\.?m\.?)?\s*$/i.exec(time);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = m[3]?.toLowerCase().replace(/\./g, "");
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  const day = receiptDate(date, now) ?? billDay;
  const t = Date.parse(`${day}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00+07:00`);
  const dayStart = Date.parse(`${billDay}T00:00:00+07:00`);
  if (!Number.isFinite(t) || t > now.getTime() + 5 * 60_000 || Math.abs(t - dayStart) > 8 * 86_400_000) return null;
  return new Date(t).toISOString();
}
