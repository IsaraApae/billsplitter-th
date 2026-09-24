import { extractJson, sanitizeScan } from "@/lib/scanResult";
import { jsonError } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";

export const maxDuration = 30;

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MAX_BYTES = 4_000_000; // Vercel's request body limit is ~4.5 MB
const TYPES = ["image/jpeg", "image/png", "image/webp"];

const PROMPT = `You are reading a photo of a restaurant or shop receipt. It may be in Thai, English, or both.
Extract every purchased line item.
- name: item name exactly as printed (keep Thai script; do not translate).
- qty: quantity as an integer (1 if not printed).
- price: the LINE TOTAL for that row (qty × unit price), as a plain number without currency symbols or thousands separators.
Do NOT include subtotal, service charge, VAT/tax, discounts, rounding, totals, payment, cash or change lines as items.
Also return the printed figures if present, otherwise null:
- subtotal: the items subtotal before service charge and VAT.
- service_charge: service charge amount (Thai: ค่าบริการ / Service Charge).
- vat: VAT amount (Thai: ภาษีมูลค่าเพิ่ม / VAT).
- vat_included: true if the receipt says prices already include VAT (e.g. "VAT included", "รวมภาษีมูลค่าเพิ่มแล้ว") and VAT is not added on top.
- discount: total discount amount as a positive number.
- total: the final grand total.
- currency: ISO 4217 code if identifiable (THB for ฿ / บาท), otherwise null.
If the image is not a receipt, return an empty items array.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          qty: { type: "NUMBER" },
          price: { type: "NUMBER" },
        },
        required: ["name", "qty", "price"],
      },
    },
    subtotal: { type: "NUMBER", nullable: true },
    service_charge: { type: "NUMBER", nullable: true },
    vat: { type: "NUMBER", nullable: true },
    vat_included: { type: "BOOLEAN" },
    discount: { type: "NUMBER", nullable: true },
    total: { type: "NUMBER", nullable: true },
    currency: { type: "STRING", nullable: true },
  },
  required: ["items"],
};

export async function POST(req: Request) {
  const limited = await rateLimit(req, "scan");
  if (limited) return limited;

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return jsonError(503, "not_configured", "Cloud scanning isn't set up (GEMINI_API_KEY missing).", { fallback: true });
  }

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

  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: file.type, data } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    console.error("Gemini request failed", e);
    return jsonError(502, "scan_failed", "Couldn't reach the scanning service.", { fallback: true });
  }

  if (res.status === 429) {
    return jsonError(429, "quota", "The free scanning quota is used up for now.", { fallback: true });
  }
  if (!res.ok) {
    console.error("Gemini error", res.status, (await res.text().catch(() => "")).slice(0, 500));
    return jsonError(502, "scan_failed", "The scanning service returned an error.", { fallback: true });
  }

  try {
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const result = sanitizeScan(extractJson(text));
    return Response.json(result);
  } catch (e) {
    console.error("Gemini parse failed", e);
    return jsonError(502, "scan_failed", "Couldn't read the scan result.", { fallback: true });
  }
}
