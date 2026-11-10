import "server-only";
import { receiptMoment } from "../receiptMoment";
import { extractJson } from "../scanResult";
import { readImageJson } from "./gemini";
import { readQrImage } from "./qrStore";

const PROMPT = `This is a photo of a shop or restaurant receipt (Thai or English). Return JSON with the moment it was printed or paid:
- date: the date printed on it as YYYY-MM-DD (Gregorian). Thai receipts often print the Buddhist year (พ.ศ.): 2569 or "69" means 2026 — convert it. Thai receipts put the day before the month (05/10/26 = 5 October). null if no date is printed.
- time: the time printed on it as HH:MM, 24-hour (convert AM/PM). If several times are printed (opened, ordered, printed, paid), use the latest one. null if no time is printed.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    date: { type: ["string", "null"], description: "YYYY-MM-DD, Gregorian year" },
    time: { type: ["string", "null"], description: "HH:MM, 24-hour" },
  },
  required: ["date", "time"],
};

const LEGACY_SCHEMA = {
  type: "OBJECT",
  properties: { date: { type: "STRING", nullable: true }, time: { type: "STRING", nullable: true } },
  required: ["date", "time"],
};

/**
 * The moment printed on a stored receipt photo (ISO, Thailand time). Null when the photo has
 * gone or shows no usable time (final: asking again gives the same); undefined when it
 * couldn't be read just now (the reader was busy or `budgetMs` ran out: worth asking again).
 */
export async function readReceiptTime(photo: string, billDay: string, budgetMs = 25_000): Promise<string | null | undefined> {
  const started = Date.now();
  const img = await readQrImage(photo);
  if (!img) return null;
  const mime = img.headers.get("content-type") ?? "image/jpeg";
  const bytes = Buffer.from(await img.arrayBuffer());
  const totalMs = Math.min(25_000, budgetMs - (Date.now() - started));
  if (totalMs < 3_000) return undefined;
  const r = await readImageJson({
    evt: "receipt-time",
    prompt: PROMPT,
    schema: SCHEMA,
    legacySchema: LEGACY_SCHEMA,
    mime,
    data: bytes.toString("base64"),
    totalMs,
    attemptMs: Math.min(12_000, totalMs),
  });
  if (!r.ok) return undefined;
  try {
    const o = extractJson(r.text) as { date?: unknown; time?: unknown };
    return receiptMoment(o.date, o.time, billDay);
  } catch {
    return undefined; // a garbled answer
  }
}
