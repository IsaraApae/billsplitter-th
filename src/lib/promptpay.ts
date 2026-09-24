// Thai PromptPay QR payloads, built with the widely used `promptpay-qr`
// library (EMVCo merchant-presented QR). Pure.

import generatePayload from "promptpay-qr";
import type { PaymentInfo, QrMode } from "./types";

/** Accepts a mobile number (10 digits), national/tax ID (13) or e-wallet ID (15). */
export function isValidPromptPayId(id: string): boolean {
  const d = id.replace(/\D/g, "");
  return /^0\d{9}$/.test(d) || /^\d{13}$/.test(d) || /^\d{15}$/.test(d);
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
