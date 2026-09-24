import { extractJson, sanitizeScan } from "@/lib/scanResult";
import { jsonError } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";

export const maxDuration = 45;

// Full Flash model (not Flash-Lite): better at reading small receipt print.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MAX_BYTES = 4_000_000; // Vercel's request body limit is ~4.5 MB
const TYPES = ["image/jpeg", "image/png", "image/webp"];

const PROMPT = `Transcribe the receipt in this photo. It may be in Thai, English, or both.

STRICT RULES
1. Copy every item name EXACTLY as printed, character for character, in its original language and script. Never translate, transliterate, correct spelling, expand abbreviations, or add words.
2. Never invent or guess text. If part of a name is unreadable, copy only the readable part. If a whole line is unreadable, skip it.
3. Read only the receipt paper. Ignore everything else in the photo (bottles, packaging, menus, screens, other papers).

ITEMS
- One entry per purchased line that has its own price. qty = the printed quantity (1 if none). price = the LINE TOTAL printed on that line, not the unit price shown after "@".
- Skip lines without their own price (set components, modifiers, notes) and lines priced 0.00.
- Never put subtotal, total, service charge, VAT/tax, discount, rounding, payment, card, cash, change, points or member lines in items.

TOTALS (numbers without currency symbols or thousands separators; null when not printed)
- subtotal: printed subtotal before discount/service/VAT (Sub Total / ยอดรวมย่อย / รวมเงิน).
- discount: sum of discount lines as a positive number (lines like "225.00-", "Discount", "ส่วนลด").
- service_charge: service charge amount (Service Charge / ค่าบริการ).
- vat: VAT amount if VAT is added on top (VAT / ภาษีมูลค่าเพิ่ม).
- vat_included: true if the receipt says prices already include VAT ("VAT INCLUDED", "รวมภาษีมูลค่าเพิ่มแล้ว").
- total: final grand total.
- currency: ISO 4217 code if identifiable (THB for ฿ / บาท / Thai receipts), else null.
If the photo is not a receipt, return an empty items array.`;

const nullableNumber = { type: ["number", "null"] };

// Strict JSON Schema (responseJsonSchema): no extra properties anywhere.
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
          price: { type: "number", minimum: 0, description: "Line total" },
        },
        required: ["name", "qty", "price"],
      },
    },
    subtotal: nullableNumber,
    discount: nullableNumber,
    service_charge: nullableNumber,
    vat: nullableNumber,
    vat_included: { type: "boolean" },
    total: nullableNumber,
    currency: { type: ["string", "null"] },
  },
  required: ["items", "subtotal", "discount", "service_charge", "vat", "vat_included", "total", "currency"],
};

// Older OpenAPI-style schema, used only if the API rejects the request above.
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
    service_charge: { type: "NUMBER", nullable: true },
    vat: { type: "NUMBER", nullable: true },
    vat_included: { type: "BOOLEAN" },
    total: { type: "NUMBER", nullable: true },
    currency: { type: "STRING", nullable: true },
  },
  required: ["items", "vat_included"],
};

type FallbackReason = "not_configured" | "quota" | "timeout" | "network" | "api_error" | "bad_output";

function log(entry: Record<string, unknown>) {
  console.info(JSON.stringify({ evt: "scan", ...entry }));
}

function fallback(status: number, reason: FallbackReason, message: string, started: number) {
  log({ engine: "none", reason, status, ms: Date.now() - started, model: MODEL });
  return jsonError(status, reason === "quota" ? "quota" : reason === "not_configured" ? "not_configured" : "scan_failed", message, {
    fallback: true,
    reason,
  });
}

function body(mime: string, data: string, legacy: boolean) {
  const image = legacy
    ? { inline_data: { mime_type: mime, data } }
    : { inline_data: { mime_type: mime, data }, media_resolution: { level: "MEDIA_RESOLUTION_HIGH" } };
  return JSON.stringify({
    contents: [{ role: "user", parts: [image, { text: PROMPT }] }],
    generationConfig: legacy
      ? { temperature: 0, responseMimeType: "application/json", responseSchema: LEGACY_SCHEMA }
      : {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: JSON_SCHEMA,
          thinkingConfig: { thinkingLevel: "low" },
        },
  });
}

export async function POST(req: Request) {
  const started = Date.now();
  const limited = await rateLimit(req, "scan");
  if (limited) return limited;

  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallback(503, "not_configured", "Cloud scanning isn't set up (GEMINI_API_KEY missing).", started);

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("image");
    file = f instanceof File ? f : null;
  } catch {
    /* handled below */
  }
  if (!file) return jsonError(400, "bad_request", "No image was uploaded.");
  if (!TYPES.includes(file.type)) return jsonError(415, "bad_type", "Please upload a JPEG, PNG or WebP image.");
  if (file.size > MAX_BYTES) return jsonError(413, "too_large", "That image is too large (max 4 MB).");

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const call = (legacy: boolean) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: body(file!.type, data, legacy),
      signal: AbortSignal.timeout(35_000),
    });

  let res: Response;
  let legacy = false;
  try {
    res = await call(false);
    if (res.status === 400) {
      // Older API surface: retry once without responseJsonSchema / media_resolution / thinking.
      log({ note: "retrying with legacy schema", detail: (await res.text().catch(() => "")).slice(0, 300) });
      legacy = true;
      res = await call(true);
    }
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return fallback(502, timeout ? "timeout" : "network", "Couldn't reach the scanning service.", started);
  }

  if (res.status === 429) return fallback(429, "quota", "The free scanning quota is used up for now.", started);
  if (!res.ok) {
    log({ detail: (await res.text().catch(() => "")).slice(0, 500) });
    return fallback(502, "api_error", `The scanning service returned an error (${res.status}).`, started);
  }

  try {
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const text =
      json.candidates?.[0]?.content?.parts
        ?.filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("") ?? "";
    const result = sanitizeScan(extractJson(text));
    log({ engine: "gemini", model: MODEL, legacy, ms: Date.now() - started, items: result.items.length });
    return Response.json({ ...result, engine: "gemini", model: MODEL });
  } catch {
    return fallback(502, "bad_output", "Couldn't read the scan result.", started);
  }
}
