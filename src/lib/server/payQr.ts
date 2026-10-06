import "server-only";
import type { PayQrSource } from "@/components/PayQr";
import { effectiveQrMode } from "../promptpay";
import type { SplitDoc } from "../types";
import { getOwner } from "./redis";

/** Which QR to show: always the creator's *current* uploaded QR, or a generated one. */
export async function resolveQr(doc: SplitDoc): Promise<PayQrSource | null> {
  const mode = effectiveQrMode(doc.payment, doc.currency);
  if (mode === "generate") return { mode, promptpay: doc.payment.promptpay };
  if (mode === "upload" && doc.payment.ownerId) {
    const owner = await getOwner(doc.payment.ownerId).catch(() => null);
    if (owner?.qrUrl) return { mode, ownerId: doc.payment.ownerId, version: owner.version };
  }
  return null;
}
