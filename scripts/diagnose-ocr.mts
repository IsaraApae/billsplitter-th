// Runs every photo in test-receipts/ through the OLD and NEW on-device OCR
// pipelines and prints what each found.
// Usage: node scripts/diagnose-ocr.mts [--lines]
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { readJpegInfo } from "../src/lib/jpeg.ts";
import { detectVatIncluded, filterOcrLines, parseReceiptText, type OcrLine } from "../src/lib/ocrParse.ts";
import { findPaperBox, prepareForOcr } from "../src/lib/paper.ts";
import { cleanScannedItems } from "../src/lib/scanFilter.ts";
import { parseReceiptText as oldParse } from "./old-ocrParse.ts";

const DIR = "test-receipts";
const CACHE = join("node_modules", ".cache", "tesseract");
const showLines = process.argv.includes("--lines");
await mkdir(CACHE, { recursive: true });

const thaiChars = (s: string) => (s.match(/[฀-๿]/g) ?? []).length;
const sum = (xs: { price: number }[]) => Math.round(xs.reduce((a, b) => a + b.price, 0) * 100) / 100;

function toLines(data: Tesseract.Page): OcrLine[] {
  return (data.blocks ?? []).flatMap((b) =>
    b.paragraphs.flatMap((p) =>
      p.lines.map((l) => ({
        text: l.text.trim(),
        confidence: l.confidence,
        words: l.words.map((w) => ({ text: w.text, confidence: w.confidence })),
      })),
    ),
  );
}

/** Same steps as the browser: orient, crop to the paper, scale, greyscale. */
async function prepareCropped(raw: Buffer): Promise<{ img: Buffer; box: string }> {
  const oriented = await sharp(raw).rotate().toBuffer();
  const meta = await sharp(oriented).metadata();
  const W = meta.width!, H = meta.height!;
  const s = Math.min(1, 320 / Math.max(W, H));
  const w = Math.round(W * s), h = Math.round(H * s);
  const small = await sharp(oriented).resize(w, h).ensureAlpha().raw().toBuffer();
  const box = findPaperBox(new Uint8Array(small), w, h);
  let pipe = sharp(oriented);
  let label = "none";
  if (box) {
    const k = W / w;
    const left = Math.round(box.x * k), top = Math.round(box.y * k);
    const width = Math.min(W - left, Math.round(box.w * k)), height = Math.min(H - top, Math.round(box.h * k));
    pipe = pipe.extract({ left, top, width, height });
    label = `${width}x${height} of ${W}x${H}`;
  }
  // Same greyscale → flatten lighting → stretch as the browser (src/lib/paper.ts).
  const { data, info } = await pipe.resize({ width: 1400, withoutEnlargement: false }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const gray = new Uint8ClampedArray(data);
  prepareForOcr(gray, info.width, info.height);
  const img = await sharp(Buffer.from(gray), { raw: { width: info.width, height: info.height, channels: 1 } }).withMetadata({ density: 300 }).png().toBuffer();
  return { img, box: label };
}

async function runNew(worker: Worker, img: Buffer, name: string) {
  const { data } = await worker.recognize(img, {}, { text: true, blocks: true });
  const lines = toLines(data);
  const filtered = filterOcrLines(lines);
  const parsed = parseReceiptText(filtered);
  parsed.vatIncluded ||= detectVatIncluded(data.text);
  const cleaned = cleanScannedItems(parsed.items);
  const avg = lines.length ? Math.round(lines.reduce((a, l) => a + l.confidence, 0) / lines.length) : 0;
  console.log(`\n-- ${name}: mean line confidence ${avg}, ${thaiChars(filtered)} Thai chars kept`);
  console.log(`   items (${cleaned.items.length}), sum ${sum(cleaned.items)} | subtotal ${parsed.subtotal} discount ${parsed.discount} total ${parsed.total} vatIncluded ${parsed.vatIncluded}`);
  cleaned.items.forEach((i) => console.log(`     ${i.qty} × ${i.name} = ${i.price}`));
  if (cleaned.dropped.length) console.log(`   dropped: ${cleaned.dropped.map((d) => `${d.name} (${d.reason})`).join(", ")}`);
  if (showLines) lines.forEach((l) => console.log(`   [${Math.round(l.confidence)}] ${l.text}`));
}

const files = (await readdir(DIR)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
const both = await createWorker(["eng", "tha"], 1, { cachePath: CACHE, logger: () => {} });
const eng = await createWorker(["eng"], 1, { cachePath: CACHE, logger: () => {} });

for (const f of files) {
  const raw = await readFile(join(DIR, f));
  const info = readJpegInfo(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  console.log(`\n=== ${f}  ${(raw.length / 1e6).toFixed(1)} MB  jpeg=${JSON.stringify(info)}`);

  // OLD pipeline: 1600px JPEG 0.82, plain text, old parser.
  const oldImg = await sharp(raw).rotate().resize(1600, 1600, { fit: "inside" }).jpeg({ quality: 82 }).toBuffer();
  const o = await both.recognize(oldImg);
  const oldItems = oldParse(o.data.text);
  console.log(`\n-- OLD (whole photo 1600px, eng+tha, no filter): ${thaiChars(o.data.text)} Thai chars in raw text`);
  console.log(`   items (${oldItems.items.length}), sum ${sum(oldItems.items)}; Thai-containing item names: ${oldItems.items.filter((i) => thaiChars(i.name)).map((i) => JSON.stringify(i.name)).join(", ") || "none"}`);

  const whole = await sharp(raw).rotate().resize(2048, 2048, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
  await runNew(both, whole, "NEW whole photo, eng+tha");
  const { img, box } = await prepareCropped(raw);
  console.log(`\n   paper crop: ${box}`);
  await runNew(both, img, "NEW cropped, eng+tha");
  await runNew(eng, img, "NEW cropped, eng only");
  for (const w of [both, eng]) await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
  await runNew(both, img, "NEW cropped, eng+tha, PSM 6");
  await runNew(eng, img, "NEW cropped, eng only, PSM 6");
  for (const w of [both, eng]) await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
}
await both.terminate();
await eng.terminate();
