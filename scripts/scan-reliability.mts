// Scan reliability check: sends one receipt to /api/scan N times and reports
// success rate, models used and timings.
//
// Usage: node scripts/scan-reliability.mts [--url https://billsplitter-th.vercel.app]
//          [--image test-receipts/photo.jpg] [--n 10] [--gap 5]
//
// The image is prepared like the app does: EXIF-rotated, max 2048px, JPEG 0.85,
// sent as FormData field "image". Requests run one after another with --gap
// seconds between them (the API allows 10 scans per minute per IP).
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = arg("url", "https://billsplitter-th.vercel.app").replace(/\/$/, "");
const n = Number(arg("n", "10"));
const gapMs = Number(arg("gap", "5")) * 1000;
const CLIENT_TIMEOUT_MS = 90_000;

let imagePath = arg("image", "");
if (!imagePath) {
  const files = (await readdir("test-receipts")).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  if (!files.length) throw new Error("Put a receipt photo in test-receipts/ or pass --image");
  imagePath = join("test-receipts", files[0]);
}
const image = await sharp(await readFile(imagePath)).rotate().resize(2048, 2048, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
console.log(`POST ${url}/api/scan × ${n}  (image ${imagePath}, ${(image.length / 1024).toFixed(0)} KB, ${gapMs / 1000}s gap)\n`);

interface Row {
  i: number;
  status: number;
  ok: boolean;
  reason: string;
  model: string;
  attempts: string;
  items: string;
  secs: number;
}
const rows: Row[] = [];
const pad = (s: string | number, w: number) => String(s).padEnd(w);
console.log(`${pad("#", 4)}${pad("status", 8)}${pad("result", 16)}${pad("model", 22)}${pad("attempts", 10)}${pad("items/sum", 16)}time`);

for (let i = 1; i <= n; i++) {
  const fd = new FormData();
  fd.append("image", new Blob([new Uint8Array(image)], { type: "image/jpeg" }), "receipt.jpg");
  const t0 = Date.now();
  let row: Row;
  try {
    const res = await fetch(`${url}/api/scan`, { method: "POST", body: fd, signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS) });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const items = Array.isArray(body.items) ? (body.items as { price: number }[]) : null;
    const sum = items ? Math.round(items.reduce((a, b) => a + (Number(b.price) || 0), 0) * 100) / 100 : null;
    row = {
      i,
      status: res.status,
      ok: res.ok,
      reason: res.ok ? "ok" : String(body.reason ?? body.error ?? "?"),
      model: String(body.model ?? "-"),
      attempts: Array.isArray(body.attempts) ? String(body.attempts.length) : String(body.attempts ?? "-"),
      items: items ? `${items.length} / ${sum}` : "-",
      secs: (Date.now() - t0) / 1000,
    };
  } catch (e) {
    row = { i, status: 0, ok: false, reason: (e as Error).name === "TimeoutError" ? "client_timeout" : "network", model: "-", attempts: "-", items: "-", secs: (Date.now() - t0) / 1000 };
  }
  rows.push(row);
  console.log(`${pad(row.i, 4)}${pad(row.status, 8)}${pad(row.reason, 16)}${pad(row.model, 22)}${pad(row.attempts, 10)}${pad(row.items, 16)}${row.secs.toFixed(1)}s`);
  if (i < n) await new Promise((r) => setTimeout(r, gapMs));
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ok = rows.filter((r) => r.ok);
const tally = (key: keyof Row, list: Row[]) =>
  Object.entries(list.reduce<Record<string, number>>((acc, r) => ((acc[String(r[key])] = (acc[String(r[key])] ?? 0) + 1), acc), {}))
    .map(([k, v]) => `${k}×${v}`)
    .join(", ");

console.log(`\nSuccess: ${ok.length}/${rows.length} (${Math.round((ok.length / rows.length) * 100)}%)`);
console.log(`Median time: ${median(ok.map((r) => r.secs)).toFixed(1)}s for successes, ${median(rows.map((r) => r.secs)).toFixed(1)}s overall`);
if (ok.length) console.log(`Models (successes): ${tally("model", ok)}`);
if (ok.length < rows.length) console.log(`Failures: ${tally("reason", rows.filter((r) => !r.ok))}`);
