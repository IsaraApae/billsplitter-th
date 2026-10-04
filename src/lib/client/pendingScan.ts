"use client";

/**
 * Hand-off for the navigation's Scan button: the photo is picked there (so the
 * camera opens straight from the tap), then the Items step picks it up.
 */
let pending: File | null = null;
export const SCAN_EVENT = "bs:scan";

export function setPendingScan(file: File): void {
  pending = file;
  window.dispatchEvent(new Event(SCAN_EVENT));
}

export function takePendingScan(): File | null {
  const f = pending;
  pending = null;
  return f;
}

export function hasPendingScan(): boolean {
  return pending !== null;
}
