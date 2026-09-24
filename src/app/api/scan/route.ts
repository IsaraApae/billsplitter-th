import { extractJson, sanitizeScan } from "@/lib/scanResult";
import { jsonError } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";

export const maxDuration = 45;

// Full Flash models (not Flash-Lite): better at reading small receipt print.
// The fallback is used when the primary is overloaded or out of quota.
const MODELS = [
  ...new Set([process.env.GEMINI_MODEL || "gemini-3.8-flash", process.env.GEMINI_FALLBACK_MODEL || "gemini-3.7-flash"]),
];
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

type FallbackReason = "not_configured" | "quota" | "busy" | "timeout" | "network" | "api_error" | "bad_output";

function log(entry: Record<string, unknown>) {
  console.info(JSON.stringify({ evt: "scan", ...entry }));
}

function fallback(status: number, reason: FallbackReason, message: string, started: number) {
  log({ engine: "none", reason, status, ms: Date.now() - started });
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

type Attempt =
  | { ok: true; res: Response; model: string; legacy: boolean }
  | { ok: false; reason: FallbackReason; status: number };

/** One model: the strict request, then (only if the API rejects its shape) the legacy one. */
async function callModel(model: string, key: string, mime: string, data: string, timeoutMs: number): Promise<Attempt> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const call = (legacy: boolean) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: body(mime, data, legacy),
      signal: AbortSignal.timeout(timeoutMs),
    });
  try {
    let legacy = false;
    let res = await call(false);
    if (res.status === 400) {
      log({ model, note: "retrying with legacy schema", detail: (await res.text().catch(() => "")).slice(0, 300) });
      legacy = true;
      res = await call(true);
    }
    if (res.ok) return { ok: true, res, model, legacy };
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    log({ model, status: res.status, detail });
    if (res.status === 429) return { ok: false, reason: "quota", status: 429 };
    if (res.status === 503 || res.status === 500 || res.status === 504) return { ok: false, reason: "busy", status: res.status };
    return { ok: false, reason: "api_error", status: res.status };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    log({ model, error: timeout ? "timeout" : String(e) });
    return { ok: false, reason: timeout ? "timeout" : "network", status: 0 };
  }
}

const MESSAGES: Record<FallbackReason, string> = {
  not_configured: "Cloud scanning isn't set up (GEMINI_API_KEY missing).",
  quota: "The free scanning quota is used up for now.",
  busy: "The scanning service is busy right now.",
  timeout: "The scanning service took too long.",
  network: "Couldn't reach the scanning service.",
  api_error: "The scanning service returned an error.",
  bad_output: "Couldn't read the scan result.",
};

export async function POST(req: Request) {
  const started = Date.now();
  const limited = await rateLimit(req, "scan");
  if (limited) return limited;

  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallback(503, "not_configured", MESSAGES.not_configured, started);

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

  // Primary model, a quick retry if it's overloaded, then the fallback Flash model.
  const plan = [MODELS[0], MODELS[0], ...MODELS.slice(1)];
  let last: Attempt = { ok: false, reason: "api_error", status: 0 };
  for (let i = 0; i < plan.length; i++) {
    const model = plan[i];
    const retryingSame = i > 0 && plan[i - 1] === model;
    // Only retry the same model when it was busy; quota/other errors skip straight to the next model.
    if (retryingSame && !(last.ok === false && last.reason === "busy")) continue;
    const remaining = maxDuration * 1000 - (Date.now() - started) - 3000;
    if (remaining < 8000) break;
    if (retryingSame) await new Promise((r) => setTimeout(r, 1200));
    last = await callModel(model, key, file.type, data, Math.min(30_000, remaining));
    if (last.ok) break;
  }
  if (!last.ok) {
    return fallback(last.status === 429 ? 429 : 502, last.reason, MESSAGES[last.reason], started);
  }

  try {
    const json = (await last.res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const text =
      json.candidates?.[0]?.content?.parts
        ?.filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("") ?? "";
    const result = sanitizeScan(extractJson(text));
    log({ engine: "gemini", model: last.model, legacy: last.legacy, ms: Date.now() - started, items: result.items.length });
    return Response.json({ ...result, engine: "gemini", model: last.model });
  } catch {
    return fallback(502, "bad_output", MESSAGES.bad_output, started);
  }
}
