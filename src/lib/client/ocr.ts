"use client";

import { detectVatIncluded, filterOcrLines, parseReceiptText, type OcrLine } from "../ocrParse";
import type { ScanResult } from "../scanResult";
import { ocrCanvas } from "./image";

/**
 * On-device OCR fallback (Tesseract.js, English + Thai), loaded only when
 * needed. The photo is cropped to the receipt first and every word must pass
 * a confidence + Thai well-formedness check, which is what stops Tesseract's
 * Thai model from inventing text out of tables, bottles and paper texture.
 */
export async function scanOnDevice(upright: HTMLCanvasElement, onProgress: (pct: number) => void): Promise<ScanResult> {
  const { createWorker, PSM } = await import("tesseract.js");
  const { canvas, cropped } = ocrCanvas(upright);
  const worker = await createWorker(["eng", "tha"], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress(Math.round(m.progress * 100));
    },
  });
  try {
    // A cropped receipt is one column: keep each row (name … price) together.
    if (cropped) await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const lines: OcrLine[] = (data.blocks ?? []).flatMap((b) =>
      b.paragraphs.flatMap((p) =>
        p.lines.map((l) => ({
          text: l.text.trim(),
          confidence: l.confidence,
          words: l.words.map((w) => ({ text: w.text, confidence: w.confidence })),
        })),
      ),
    );
    const filtered = filterOcrLines(lines);
    const parsed = parseReceiptText(filtered);
    try {
      if (localStorage.getItem("bs:debug")) {
        const dbg = { cropped, raw: data.text, filtered, parsed };
        (window as unknown as { __bsOcr?: typeof dbg }).__bsOcr = dbg;
        console.debug("[ocr]", dbg);
      }
    } catch {}
    return {
      items: parsed.items,
      subtotal: parsed.subtotal,
      serviceCharge: parsed.serviceCharge,
      vat: parsed.vat,
      vatIncluded: parsed.vatIncluded || detectVatIncluded(data.text),
      discount: parsed.discount,
      total: parsed.total,
      currency: null,
    };
  } finally {
    await worker.terminate();
  }
}
