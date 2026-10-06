import "server-only";
import { extractJson } from "../scanResult";
import { sanitizeSlip, type SlipRead } from "../slip";
import { readImageJson } from "./gemini";

const PROMPT = `This image should be a Thai bank transfer slip (an e-slip from a mobile banking app, PromptPay or a wallet). Return JSON:
- isSlip: true only if it is a completed money-transfer confirmation slip; false for anything else (receipts, QR codes, screenshots of chats, edited or partial images).
- amount: the transferred amount as a plain number (no currency, no thousands separators).
- date: the transfer date as YYYY-MM-DD in the Gregorian calendar. Thai slips often print the Buddhist year (2569 or "69" means 2026) and Thai month abbreviations (ม.ค. ก.พ. มี.ค. เม.ย. พ.ค. มิ.ย. ก.ค. ส.ค. ก.ย. ต.ค. พ.ย. ธ.ค.); the day comes before the month.
- reference: the transaction reference number (เลขที่รายการ, รหัสอ้างอิง, Ref No., Transaction ID) exactly as printed.
- senderName and receiverName: exactly as printed (Thai or English), including titles like นาย / นางสาว.
- receiverAccount: the receiver's account number, phone or PromptPay ID exactly as printed, keeping x/X masks.
- bank: the sending bank or app.
Use null for anything not shown.`;

const nullableString = { type: ["string", "null"] };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    isSlip: { type: "boolean" },
    amount: { type: ["number", "null"] },
    date: { type: ["string", "null"], description: "YYYY-MM-DD, Gregorian year" },
    reference: nullableString,
    senderName: nullableString,
    receiverName: nullableString,
    receiverAccount: nullableString,
    bank: nullableString,
  },
  required: ["isSlip", "amount", "date", "reference", "senderName", "receiverName", "receiverAccount", "bank"],
};

const LEGACY_SCHEMA = {
  type: "OBJECT",
  properties: {
    isSlip: { type: "BOOLEAN" },
    amount: { type: "NUMBER", nullable: true },
    date: { type: "STRING", nullable: true },
    reference: { type: "STRING", nullable: true },
    senderName: { type: "STRING", nullable: true },
    receiverName: { type: "STRING", nullable: true },
    receiverAccount: { type: "STRING", nullable: true },
    bank: { type: "STRING", nullable: true },
  },
  required: ["isSlip"],
};

const MAX_BYTES = 4_000_000;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export type SlipUpload =
  | { ok: true; slip: SlipRead; bytes: Buffer; personRef: string }
  | { ok: false; status: number; code: string; message: string };

/**
 * Reads an uploaded slip (multipart: `image`, plus `field` naming the person)
 * with Gemini. The checks against the bill happen in the caller.
 */
export async function readSlipUpload(req: Request, field: "personId" | "personKey"): Promise<SlipUpload> {
  let file: File | null = null;
  let personRef = "";
  try {
    const form = await req.formData();
    const f = form.get("image");
    file = f instanceof File ? f : null;
    personRef = String(form.get(field) ?? "").slice(0, 40);
  } catch {
    /* handled below */
  }
  if (!file || !personRef) return { ok: false, status: 400, code: "bad_request", message: "Send the slip picture and who paid." };
  if (!TYPES.includes(file.type)) return { ok: false, status: 415, code: "bad_type", message: "Please upload a JPEG, PNG or WebP picture." };
  if (file.size > MAX_BYTES) return { ok: false, status: 413, code: "too_large", message: "That picture is too large." };
  const bytes = Buffer.from(await file.arrayBuffer());

  const r = await readImageJson({
    evt: "slip",
    prompt: PROMPT,
    schema: SCHEMA,
    legacySchema: LEGACY_SCHEMA,
    mime: file.type,
    data: bytes.toString("base64"),
    totalMs: 45_000,
  });
  if (!r.ok) {
    if (r.reason === "not_configured") {
      return { ok: false, status: 503, code: "not_configured", message: "Slip checking isn't set up (GEMINI_API_KEY missing)." };
    }
    return { ok: false, status: 502, code: "read_failed", message: "Couldn't read the slip right now — try again in a minute." };
  }
  try {
    const slip = sanitizeSlip(extractJson(r.text));
    console.info(JSON.stringify({ evt: "slip", model: r.model, isSlip: slip.isSlip, hasRef: !!slip.reference, date: slip.date }));
    return { ok: true, slip, bytes, personRef };
  } catch {
    return { ok: false, status: 502, code: "read_failed", message: "Couldn't read the slip — try a clearer picture." };
  }
}
