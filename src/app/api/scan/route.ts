import { extractJson, sanitizeScan, summariseFailure, type ScanAttempt } from "@/lib/scanResult";
import { jsonError } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { getModelCooldowns, setModelCooldown } from "@/lib/server/redis";

// Time budget: ~20 s per Gemini call, ~55 s across all calls; the function
// may run a little longer than that to finish responding.
const ATTEMPT_MS = 20_000;
const TOTAL_MS = 55_000;
export const maxDuration = 60;

/**
 * Models tried in order. Each has its own free-tier quota, so when one is out
 * of quota or overloaded the next one can still answer.
 * Override with GEMINI_MODELS="model-a,model-b,…".
 */
const DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite"];
const MODELS = (process.env.GEMINI_MODELS ?? "")
  .split(",")
  .map((m) => m.trim())
  .filter((m) => /^[\w.-]+$/.test(m));
const CHAIN = MODELS.length ? [...new Set(MODELS)] : DEFAULT_MODELS;

const MAX_BYTES = 4_000_000; // Vercel's request body limit is ~4.5 MB
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Lowest thinking level each model accepts (Flash-Lite allows "minimal"). */
function lowestThinking(model: string): "minimal" | "low" {
  return /flash-lite/.test(model) ? "minimal" : "low";
}

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
- total: the final amount paid.
- currency: ISO 4217 code from symbols or context (฿ / บาท / Thai receipt → THB). Default to THB for Thai receipts.
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
  },
  required: ["items", "subtotal", "discount", "serviceCharge", "vat", "vatIncluded", "total", "currency", "date"],
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

/** Google's error status and, for quota errors, which quota was hit. */
function describeGoogleError(raw: string): Record<string, unknown> {
  try {
    const e = (
      JSON.parse(raw) as {
        error?: { status?: string; message?: string; details?: { violations?: { quotaId?: string; quotaMetric?: string }[]; retryDelay?: string }[] };
      }
    ).error;
    const details = e?.details ?? [];
    return {
      googleStatus: e?.status,
      message: e?.message?.split("\n")[0]?.slice(0, 160),
      quota: details.flatMap((d) => d.violations ?? []).map((v) => v.quotaId ?? v.quotaMetric).filter(Boolean),
      retryDelay: details.find((d) => d.retryDelay)?.retryDelay,
    };
  } catch {
    return { detail: raw.slice(0, 300) };
  }
}

function body(model: string, mime: string, data: string, legacy: boolean) {
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
          thinkingConfig: { thinkingLevel: lowestThinking(model) },
        },
  });
}

type CallResult = { attempt: ScanAttempt; text?: string; cooldownSec?: number };

/** "32656s" → 32656 */
const seconds = (delay: unknown) => (typeof delay === "string" && /^\d+(\.\d+)?s$/.test(delay) ? parseFloat(delay) : undefined);

/** One Gemini call. A 400 means our request shape was rejected: retried once in the legacy shape. */
async function callModel(model: string, key: string, mime: string, data: string, timeoutMs: number): Promise<CallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const started = Date.now();
  const done = (status: number, outcome: ScanAttempt["outcome"], text?: string): CallResult => ({
    attempt: { model, status, outcome, ms: Date.now() - started },
    text,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const call = (legacy: boolean) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: body(model, mime, data, legacy),
      signal: controller.signal,
    });
  try {
    let res = await call(false);
    if (res.status === 400) {
      log({ model, status: 400, note: "retrying in legacy request shape", ...describeGoogleError(await res.text().catch(() => "")) });
      res = await call(true);
    }
    if (!res.ok) {
      const g = describeGoogleError(await res.text().catch(() => ""));
      log({ model, status: res.status, ...g });
      if (res.status === 429) {
        // Out of quota: skip this model until Google says it resets (daily) or for a minute.
        const daily = Array.isArray(g.quota) && g.quota.some((q) => /PerDay/i.test(String(q)));
        return { ...done(429, "quota"), cooldownSec: seconds(g.retryDelay) ?? (daily ? 3600 : 60) };
      }
      if (res.status === 500 || res.status === 503 || res.status === 504) return done(res.status, "busy");
      return done(res.status, "api_error"); // 400 etc.: bad image or blocked — another model won't help
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    const blocked = json.promptFeedback?.blockReason ?? (json.candidates?.[0]?.finishReason === "SAFETY" ? "SAFETY" : undefined);
    if (blocked) {
      log({ model, status: 200, blocked });
      return done(200, "api_error");
    }
    const text =
      json.candidates?.[0]?.content?.parts
        ?.filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("") ?? "";
    return done(200, "ok", text);
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
    log({ model, error: aborted ? "timeout" : String(e) });
    return aborted ? { ...done(0, "timeout"), cooldownSec: 120 } : done(0, "network");
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  const attempts: ScanAttempt[] = [];
  const left = () => TOTAL_MS - (Date.now() - started);
  let text: string | undefined;
  let model: string | undefined;

  // Models that recently ran out of quota, timed out or kept returning 503 go
  // last, so this scan doesn't wait on them again (they're still a last resort).
  const cooling = await getModelCooldowns(CHAIN);
  const order = [...CHAIN.filter((m) => !cooling.has(m)), ...CHAIN.filter((m) => cooling.has(m))];

  chain: for (const m of order) {
    // Busy (500/503) gets one retry on the same model after 1–2 s; quota (429)
    // or a timeout moves straight to the next model; a 400 stops the chain.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (left() < 5_000) break chain;
      const r = await callModel(m, key, file.type, data, Math.min(ATTEMPT_MS, left()));
      attempts.push(r.attempt);
      const busyTwice = r.attempt.outcome === "busy" && attempt === 1;
      if (r.cooldownSec || busyTwice) await setModelCooldown(m, r.cooldownSec ?? 120);
      if (r.attempt.outcome === "ok") {
        text = r.text;
        model = m;
        break chain;
      }
      if (r.attempt.outcome === "api_error") break chain;
      if (r.attempt.outcome !== "busy" || attempt === 1) break;
      await sleep(1000 + Math.random() * 1000);
    }
  }

  const tried = attempts.map((a) => `${a.model}:${a.status || a.outcome}`);
  if (text === undefined || !model) {
    const reason = summariseFailure(attempts);
    log({ engine: "none", reason, tried, cooling: [...cooling], ms: Date.now() - started });
    return jsonError(reason === "quota" ? 429 : 502, reason === "quota" ? "quota" : "scan_failed", MESSAGES[reason], {
      reason,
      attempts,
    });
  }

  try {
    const result = sanitizeScan(extractJson(text));
    log({ engine: "gemini", model, tried, cooling: [...cooling], ms: Date.now() - started, items: result.items.length });
    return Response.json({ ...result, model, attempts });
  } catch {
    attempts[attempts.length - 1].outcome = "bad_output";
    log({ engine: "none", reason: "bad_output", tried, ms: Date.now() - started });
    return jsonError(502, "scan_failed", MESSAGES.bad_output, { reason: "bad_output", attempts });
  }
}
