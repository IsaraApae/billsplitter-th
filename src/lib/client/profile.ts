"use client";

import type { PaymentInfo, PersonColor, QrMode } from "../types";
import { load, save } from "./storage";

/** The device owner's settings ("Me" page). */
export interface Profile {
  name: string;
  emoji?: string;
  color?: PersonColor;
  qrMode: QrMode;
  promptpay: string; // for "generate" mode
  note: string; // bank details shown on shared pages
  ownerId?: string; // server-side owner record for the uploaded QR
  ownerToken?: string; // secret proving this device owns it
  qrVersion?: number; // bumps when the uploaded QR changes
  roundUp?: number; // last rounding step used (minor units), reused for new splits
}

const KEY = "bs:profile";
const EVENT = "bs-profile";

export function getProfile(): Profile {
  // Stored data may predate newer fields, so fill in defaults.
  const p = load<Partial<Profile> | null>(KEY, null);
  if (p) return { qrMode: "none", promptpay: "", note: "", name: "", ...p };
  // Migrate the payment info older versions remembered per device.
  const old = load<{ promptpay?: string; note?: string }>("bs:payment", {});
  return {
    name: "",
    qrMode: old.promptpay ? "generate" : "none",
    promptpay: old.promptpay ?? "",
    note: old.note ?? "",
  };
}

export function saveProfile(p: Profile): void {
  save(KEY, p);
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {}
}

export function onProfileChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Payment details stamped onto a split from the Me settings. */
export function paymentFromProfile(p: Profile): PaymentInfo {
  const upload = p.qrMode === "upload" && !!p.ownerId;
  return {
    // Only share the number when it's the chosen method.
    promptpay: p.qrMode === "generate" ? p.promptpay : "",
    note: p.note,
    qrMode: p.qrMode === "upload" && !upload ? "none" : p.qrMode,
    ownerId: upload ? p.ownerId : undefined,
  };
}

/** URL of the owner's uploaded QR image (same-origin proxy, cache-busted). */
export function qrImageUrl(ownerId: string, version?: number): string {
  return `/api/qr/${ownerId}?v=${version ?? 0}`;
}
