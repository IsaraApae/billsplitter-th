// Thai PromptPay QR payloads, built with the widely used `promptpay-qr`
// library (EMVCo merchant-presented QR). Pure.

import generatePayload from "promptpay-qr";
import type { PaymentInfo, QrMode } from "./types";

/**
 * Clean what someone typed or pasted into the PromptPay field: Thai (๐–๙) and
 * full-width digits become 0–9, separators go, and an international Thai
 * mobile (+66 81 234 5678 / 66812345678) becomes its local 0812345678 form.
 */
export function normalizePromptPayInput(input: string): string {
  let d = input
    .replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50))
    .replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10))
    .replace(/\D/g, "");
  if (/^66[1-9]\d{8}$/.test(d)) d = `0${d.slice(2)}`;
  else if (/^0066[1-9]\d{8}$/.test(d)) d = `0${d.slice(4)}`;
  return d.slice(0, 15);
}

/**
 * Accepts a Thai mobile number (10 digits, 06/08/09…), national/tax ID (13) or
 * e-wallet ID (15). Bank account numbers are not PromptPay IDs: a 10-digit
 * account starting with 0 must not pass as a "phone", or the QR pays someone else.
 */
export function isValidPromptPayId(id: string): boolean {
  const d = id.replace(/\D/g, "");
  return /^0[689]\d{8}$/.test(d) || /^\d{13}$/.test(d) || /^\d{15}$/.test(d);
}

/**
 * Payload for a PromptPay QR. `amountMinor` is in satang; omit it for a
 * reusable QR where the payer types the amount.
 */
export function promptPayPayload(id: string, amountMinor?: number): string {
  const amount = amountMinor && amountMinor > 0 ? amountMinor / 100 : undefined;
  return generatePayload(id.replace(/\D/g, ""), { amount });
}

export function formatPromptPayId(id: string): string {
  if (/^0\d{9}$/.test(id)) return `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;
  if (/^\d{13}$/.test(id)) return `${id[0]}-${id.slice(1, 5)}-${id.slice(5, 10)}-${id.slice(10, 12)}-${id[12]}`;
  return id;
}

/** Effective QR mode of a split (older splits have no `qrMode`). */
export function effectiveQrMode(p: PaymentInfo, currency: string): QrMode {
  const mode = p.qrMode ?? (p.promptpay ? "generate" : "none");
  if (mode === "generate" && (currency !== "THB" || !isValidPromptPayId(p.promptpay))) return "none";
  if (mode === "upload" && !p.ownerId) return "none";
  return mode;
}

/**
 * The account number in bank details, digits only, ready to paste into a
 * banking app: "KBank 181-1-91964-7" → "1811919647". Null if there isn't one
 * (8–20 digits, optionally split by dashes or spaces).
 */
export function accountNumber(note: string): string | null {
  for (const m of note.matchAll(/\d[\d\s-]*\d/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 20) return digits;
  }
  return null;
}
