// Bank transfer slips: what Gemini read off the picture, and the checks that
// decide whether it can tick someone as paid. Pure.

import { parseMoney } from "./money";
import { clockTime, thaiMoment } from "./receiptMoment";
import { receiptDate } from "./scanResult";

export interface SlipRead {
  isSlip: boolean;
  /** major units (e.g. 250.5) as printed */
  amount: number | null;
  /** YYYY-MM-DD (Gregorian) */
  date: string | null;
  /** the transfer's time as printed, "HH:MM" (24-hour, Thailand) */
  time: string | null;
  reference: string | null;
  senderName: string | null;
  receiverName: string | null;
  /** receiver's account / phone / PromptPay as printed, masks included */
  receiverAccount: string | null;
  bank: string | null;
}

const str = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);

/** Defensive clean-up of the model's JSON. */
export function sanitizeSlip(raw: unknown, now = new Date()): SlipRead {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = typeof o.amount === "number" ? o.amount : typeof o.amount === "string" ? Number(o.amount.replace(/[^\d.]/g, "")) : NaN;
  return {
    isSlip: o.isSlip === true,
    amount: Number.isFinite(n) && n > 0 && n < 1e9 ? n : null,
    date: receiptDate(o.date, now),
    time: clockTime(o.time),
    reference: str(o.reference, 60),
    senderName: str(o.senderName),
    receiverName: str(o.receiverName),
    receiverAccount: str(o.receiverAccount, 40),
    bank: str(o.bank, 40),
  };
}

/**
 * When the money was sent, from the date and time printed on the slip (ISO), or null when it
 * shows no time or the moment is in the future (a misread).
 */
export function slipMoment(date: string | null, time: string | null, now = Date.now()): string | null {
  if (!date || !time) return null;
  const t = thaiMoment(date, time);
  return Number.isFinite(t) && t <= now + 5 * 60_000 ? new Date(t).toISOString() : null;
}

/** How far short of what was owed a payment can be and still count as paid: ฿1, or 1% (minor units). */
export const slack = (owed: number) => Math.max(100, Math.round(owed / 100));

/**
 * A slip for someone already ticked paid is kept only for its time, so it has to be this
 * payment: what was left to show by slip (`left`), give or take the slack, up to their share.
 */
export const fitsShare = (amount: number, left: number, owed: number) => amount >= left - slack(owed) && amount <= owed + slack(owed);

/** Same reference however it was spaced or dashed (for "already used"). */
export const normaliseReference = (ref: string) => ref.replace(/[^0-9A-Za-z]/g, "").toUpperCase();

/**
 * Was the money sent to the right person?
 * - "match": the receiver's visible digits are part of their PromptPay number
 * - "unknown": nothing to compare (e.g. only a masked bank account is shown)
 */
export function receiverCheck(slip: SlipRead, payee: { promptpay?: string }): "match" | "unknown" {
  const digits = (slip.receiverAccount ?? "").replace(/\D/g, "");
  if (payee.promptpay && digits.length >= 4 && payee.promptpay.includes(digits)) return "match";
  return "unknown";
}

export type SlipVerdict =
  | { ok: true; amount: number; reference: string; receiver: "match" | "unknown" }
  | { ok: false; reason: string };

/**
 * Whether a slip can tick someone: a real transfer slip, readable amount and
 * reference, dated on or after the bill (and not in the future), paid to the
 * organiser as far as can be told. `amount` is in minor units.
 */
export function checkSlip(
  slip: SlipRead,
  opts: { billDay: string; currency: string; organiser: { promptpay?: string } },
): SlipVerdict {
  if (!slip.isSlip) return { ok: false, reason: "That doesn't look like a bank transfer slip." };
  const amount = slip.amount === null ? null : parseMoney(slip.amount, opts.currency);
  if (!amount || amount <= 0) return { ok: false, reason: "Couldn't read the amount on the slip." };
  if (!slip.date) return { ok: false, reason: "Couldn't read a valid date on the slip." };
  if (slip.date < opts.billDay) return { ok: false, reason: `The slip is dated ${slip.date}, before the bill (${opts.billDay}).` };
  if (!slip.reference || normaliseReference(slip.reference).length < 6) {
    return { ok: false, reason: "Couldn't read the slip's reference number." };
  }
  const receiver = receiverCheck(slip, opts.organiser);
  return { ok: true, amount, reference: normaliseReference(slip.reference), receiver };
}

export type SlipCheck = Parameters<typeof checkSlip>[1];

/**
 * A quick (Flash-Lite) read worth trusting without waiting for a bigger
 * model: it passes checkSlip and shows exactly what's still owed (minor
 * units). Anything else — a part payment, a misread digit — waits.
 */
export function slipMatches(slip: SlipRead, check: SlipCheck, owed: number): boolean {
  const v = checkSlip(slip, check);
  return v.ok && v.amount === owed;
}
