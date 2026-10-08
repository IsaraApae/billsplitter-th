import { extractJson, sanitizeScan, type ScanAttempt } from "@/lib/scanResult";
import { readImageJson } from "@/lib/server/gemini";
import { jsonError } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";

// Time budget: ~55 s across all Gemini calls; the function may run a little
// longer than that to finish responding.
const TOTAL_MS = 55_000;
export const maxDuration = 60;

const MAX_BYTES = 4_000_000; // Vercel's request body limit is ~4.5 MB
const TYPES = ["image/jpeg", "image/png", "image/webp"];

const PROMPT = `Read the receipt in this photo and return its contents as JSON. The receipt may be in Thai, English or both.

ITEMS — every purchased line:
- name: exactly as printed, character for character. Keep Thai names in Thai script. Never translate, transliterate, correct spelling or expand abbreviations.
- qty: the printed quantity (1 if none).
- price: the LINE price printed on that line (qty × unit price), not the unit price after "@".
- A discount that applies to ONE item (printed directly under that item, e.g. "ส่วนลด -20" under a dish) is its own item with a NEGATIVE price, named as printed.
- A discount on the WHOLE bill is NOT an item: bank/card/member promotions and discount lines printed after the item list or near the subtotal (e.g. "UOB 15%/450  225.00-", "Member 10%", "ส่วนลดท้ายบิล") go in the discount field.
- Skip lines without their own price (set components, modifiers, notes) and lines priced 0.00.
- Never invent or guess text. If part of a name is unreadable, copy only the readable part; if a whole line is unreadable, skip it.
- Read only the receipt paper; ignore bottles, packaging, menus, screens and other papers in the photo.

NEVER put these in items — they have their own fields:
subtotal, total, VAT/tax, service charge, cash, change, payment/card, rounding, points/member lines.

FIELDS (plain numbers: no currency symbols, no thousands separators; null when not printed):
- subtotal: printed subtotal before receipt-wide discount, service and VAT (Sub Total / ยอดรวมย่อย / รวมเงิน).
- discount: a discount on the whole bill, as a positive number (e.g. "UOB 15%  225.00-", "Discount", "ส่วนลด" under the subtotal).
- serviceCharge: service charge amount (Service Charge / ค่าบริการ).
- vat: VAT amount when it is added on top (VAT / ภาษีมูลค่าเพิ่ม).
- vatIncluded: true when the receipt says prices already include VAT (e.g. "VAT incl.", "VAT INCLUDED", "รวมภาษีมูลค่าเพิ่มแล้ว", "ราคารวม VAT"); otherwise false.
- rounding: a rounding adjustment line if printed ("Rounding", "Round adj.", "ปัดเศษ"), signed (e.g. -0.45 or 0.55); null if none.
- total: the final amount paid.
- currency: ISO 4217 code from symbols or context (฿ / บาท / Thai receipt → THB). Default to THB for Thai receipts.
- merchant: the shop or restaurant name printed at the top (brand plus branch if shown, e.g. "Yoshinoya Chamchuree Square"), as printed, Thai or English; not the company's legal name (CO.,LTD / บริษัท) unless that's all there is. null if none.
- date: the date printed on the receipt as YYYY-MM-DD (Gregorian). Thai receipts often print the Buddhist year (พ.ศ.): 2569 or "69" means 2026 — convert it. Thai receipts put the day before the month (05/10/26 = 5 October). null if no date is printed.
If the photo is not a receipt, return an empty items array.`;

const nullableNumber = { type: ["number", "null"] };

// Strict JSON Schema matching the applyScan contract.
const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Exactly as printed, original language" },
          qty: { type: "integer", minimum: 1 },
          price: { type: "number", description: "Line price; negative for a discount on one item" },
        },
        required: ["name", "qty", "price"],
      },
    },
    subtotal: nullableNumber,
    discount: nullableNumber,
    serviceCharge: nullableNumber,
    vat: nullableNumber,
    vatIncluded: { type: "boolean" },
    total: nullableNumber,
    currency: { type: ["string", "null"] },
    date: { type: ["string", "null"], description: "YYYY-MM-DD, Gregorian year" },
    merchant: { type: ["string", "null"], description: "Shop or restaurant name" },
    rounding: { type: ["number", "null"], description: "Printed rounding adjustment, signed" },
  },
  required: ["items", "subtotal", "discount", "serviceCharge", "vat", "vatIncluded", "total", "currency", "date", "merchant", "rounding"],
};

// Older OpenAPI-style schema, used only if a model rejects the request above.
const LEGACY_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, qty: { type: "INTEGER" }, price: { type: "NUMBER" } },
        required: ["name", "qty", "price"],
      },
    },
    subtotal: { type: "NUMBER", nullable: true },
    discount: { type: "NUMBER", nullable: true },
    serviceCharge: { type: "NUMBER", nullable: true },
    vat: { type: "NUMBER", nullable: true },
    vatIncluded: { type: "BOOLEAN" },
    total: { type: "NUMBER", nullable: true },
    currency: { type: "STRING", nullable: true },
    date: { type: "STRING", nullable: true },
    merchant: { type: "STRING", nullable: true },
    rounding: { type: "NUMBER", nullable: true },
  },
  required: ["items", "vatIncluded"],
};

type Reason = "not_configured" | ScanAttempt["outcome"];

const MESSAGES: Record<Exclude<Reason, "ok">, string> = {
  not_configured: "Receipt scanning isn't set up (GEMINI_API_KEY missing).",
  quota: "The free scanning quota is used up for now.",
  busy: "The scanning service is busy right now.",
  timeout: "The scanning service took too long.",
  network: "Couldn't reach the scanning service.",
  api_error: "The scanner couldn't read this photo.",
  bad_output: "Couldn't read the scan result.",
};

function log(entry: Record<string, unknown>) {
  console.info(JSON.stringify({ evt: "scan", ...entry }));
}

export async function POST(req: Request) {
  const started = Date.now();
  const limited = await rateLimit(req, "scan");
  if (limited) return limited;

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    log({ reason: "not_configured" });
    return jsonError(503, "not_configured", MESSAGES.not_configured, { reason: "not_configured", attempts: [] });
  }

  let file: File | null = null;
  try {
    const f = (await req.formData()).get("image");
    file = f instanceof File ? f : null;
  } catch {
    /* handled below */
  }
  if (!file) return jsonError(400, "bad_request", "No image was uploaded.");
  if (!TYPES.includes(file.type)) return jsonError(415, "bad_type", "Please upload a JPEG, PNG or WebP image.");
  if (file.size > MAX_BYTES) return jsonError(413, "too_large", "That image is too large (max 4 MB).");
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");

  const r = await readImageJson({
    evt: "scan",
    prompt: PROMPT,
    schema: JSON_SCHEMA,
    legacySchema: LEGACY_SCHEMA,
    mime: file.type,
    data,
    totalMs: TOTAL_MS - (Date.now() - started),
  });
  const { attempts } = r;
  const tried = attempts.map((a) => `${a.model}:${a.status || a.outcome}`);
  if (!r.ok) {
    const reason = r.reason;
    log({ engine: "none", reason, tried, ms: Date.now() - started });
    if (reason === "not_configured") {
      return jsonError(503, "not_configured", MESSAGES.not_configured, { reason, attempts });
    }
    return jsonError(reason === "quota" ? 429 : 502, reason === "quota" ? "quota" : "scan_failed", MESSAGES[reason], {
      reason,
      attempts,
    });
  }

  try {
    const result = sanitizeScan(extractJson(r.text));
    log({ engine: "gemini", model: r.model, tried, ms: Date.now() - started, items: result.items.length });
    return Response.json({ ...result, model: r.model, attempts });
  } catch {
    attempts[attempts.length - 1].outcome = "bad_output";
    log({ engine: "none", reason: "bad_output", tried, ms: Date.now() - started });
    return jsonError(502, "scan_failed", MESSAGES.bad_output, { reason: "bad_output", attempts });
  }
}
