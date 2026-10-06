import "server-only";
import type { Payment } from "./redis";

/**
 * A payment from a request body: { paid: true } (in full), { paid: false }
 * (not yet), or { amount } (part of it, minor units). Null if invalid.
 */
export function paymentFrom(body: { paid?: unknown; amount?: unknown } | undefined): Payment | null {
  if (!body) return null;
  if (typeof body.amount === "number") {
    return Number.isInteger(body.amount) && body.amount > 0 && body.amount < 1e11 ? { kind: "part", amount: body.amount } : null;
  }
  if (typeof body.paid === "boolean") return body.paid ? { kind: "full" } : { kind: "none" };
  return null;
}
