// Prints the detected paper box and a whiteness profile down the receipt's centre.
// Usage: node scripts/probe-paper.mts <photo>
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { findPaperBox } from "../src/lib/paper.ts";

const raw = await readFile(process.argv[2] ?? "test-receipts/S__49799170.jpg");
const oriented = await sharp(raw).rotate().toBuffer();
const meta = await sharp(oriented).metadata();
const W = meta.width!, H = meta.height!;
const s = 320 / Math.max(W, H);
const w = Math.round(W * s), h = Math.round(H * s);
const small = await sharp(oriented).resize(w, h).ensureAlpha().raw().toBuffer();
const box = findPaperBox(new Uint8Array(small), w, h);
console.log({ w, h, box, bottomPct: box && (((box.y + box.h) / h) * 100).toFixed(1) });
if (box) {
  const cx = Math.round(box.x + box.w / 2);
  const rows: string[] = [];
  for (let y = 0; y < h; y += 8) {
    const i = (y * w + cx) * 4;
    const r = small[i], g = small[i + 1], b = small[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    rows.push(`${y}:${Math.max(0, mn - (mx - mn))}`);
  }
  console.log(rows.join(" "));
}
