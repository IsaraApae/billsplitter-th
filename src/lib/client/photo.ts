"use client";

import { compressImage } from "./image";

/** Where a stored receipt photo (`SplitDoc.photo`) is served from. */
export function photoSrc(photo: string): string {
  return `/api/receipt?src=${encodeURIComponent(photo)}`;
}

/** Uploads a smaller copy of the receipt photo for the shared page; null if it fails. */
export async function uploadReceiptPhoto(photo: Blob): Promise<string | null> {
  try {
    const small = await compressImage(photo, 1600, 0.8);
    const fd = new FormData();
    fd.append("image", small, "receipt.jpg");
    const res = await fetch("/api/receipt", { method: "POST", body: fd });
    const data = await res.json().catch(() => null);
    return res.ok && typeof data?.photo === "string" ? data.photo : null;
  } catch {
    return null; // the split works without a photo
  }
}
