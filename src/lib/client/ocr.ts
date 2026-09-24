"use client";

import { parseReceiptText } from "../ocrParse";
import type { ScanResult } from "../scanResult";

/** On-device OCR fallback (Tesseract.js, English + Thai). Loaded only when needed. */
export async function scanOnDevice(image: Blob, onProgress: (pct: number) => void): Promise<ScanResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["eng", "tha"], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(image);
    const parsed = parseReceiptText(data.text);
    return {
      items: parsed.items,
      subtotal: parsed.subtotal,
      serviceCharge: parsed.serviceCharge,
      vat: parsed.vat,
      vatIncluded: false,
      discount: null,
      total: parsed.total,
      currency: null,
    };
  } finally {
    await worker.terminate();
  }
}
