// Bank transfer slips: what Gemini read off the picture, and the checks that
// decide whether it can tick someone as paid. Pure.

import { parseMoney } from "./money";
import { receiptDate } from "./scanResult";

export interface SlipRead {
  isSlip: boolean;
  /** major units (e.g. 250.5) as printed */
  amount: number | null;
  /** YYYY-MM-DD (Gregorian) */
  date: string | null;
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
    reference: str(o.reference, 60),
    senderName: str(o.senderName),
    receiverName: str(o.receiverName),
    receiverAccount: str(o.receiverAccount, 40),
    bank: str(o.bank, 40),
  };
}

/** Same reference however it was spaced or dashed (for "already used"). */
export const normaliseReference = (ref: string) => ref.replace(/[^0-9A-Za-z]/g, "").toUpperCase();

const TITLES = /^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr|mrs|ms|miss)\.?\s*/i;

/** First name without a title, lower-cased: "นาย อิสรา อ." → "อิสรา". */
export function firstName(name: string): string {
  return name.trim().replace(TITLES, "").split(/\s+/)[0]?.replace(/[.,]/g, "").toLocaleLowerCase() ?? "";
}

const isThai = (s: string) => /[฀-๿]/.test(s);

/**
 * Was the money sent to the organiser?
 * - "match": the name on the slip matches the organiser's bank-account name,
 *   or the receiver's visible digits are part of their PromptPay number
 * - "mismatch": the organiser's bank-account name is set and doesn't match
 * - "unknown": nothing to compare (e.g. only a masked bank account is shown)
 */
export function receiverCheck(slip: SlipRead, organiser: { slipName?: string; promptpay?: string }): "match" | "mismatch" | "unknown" {
  if (organiser.slipName?.trim() && slip.receiverName) {
    // Several spellings allowed ("ISARA A. / อิสรา อ."); compare only names in
    // the same script as the slip — a Thai name can't be checked against an
    // English one.
    const got = firstName(slip.receiverName);
    const thai = isThai(got);
    const names = organiser.slipName
      .split(/[/,|]/)
      .map(firstName)
      .filter((n) => n.length >= 2 && isThai(n) === thai);
    if (names.length > 0 && got.length >= 2) {
      return names.some((want) => want.startsWith(got) || got.startsWith(want)) ? "match" : "mismatch";
    }
  }
  const digits = (slip.receiverAccount ?? "").replace(/\D/g, "");
  if (organiser.promptpay && digits.length >= 4 && organiser.promptpay.includes(digits)) return "match";
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
  opts: { billDay: string; currency: string; organiser: { slipName?: string; promptpay?: string } },
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
  if (receiver === "mismatch") return { ok: false, reason: "This slip was paid to someone else." };
  return { ok: true, amount, reference: normaliseReference(slip.reference), receiver };
}
