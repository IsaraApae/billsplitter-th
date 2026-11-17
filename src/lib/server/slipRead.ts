import "server-only";
import { sniffImageType } from "../imageType";
import { extractJson, receiptDate } from "../scanResult";
import { clockTime } from "../receiptMoment";
import { sanitizeSlip, slipMoment, type SlipRead } from "../slip";
import { readImageJson } from "./gemini";
import { readQrImage } from "./qrStore";

const PROMPT = `This image should be a Thai bank transfer slip (an e-slip from a mobile banking app, PromptPay or a wallet). Return JSON:
- isSlip: true only if it is a completed money-transfer confirmation slip; false for anything else (receipts, QR codes, screenshots of chats, edited or partial images).
- amount: the transferred amount as a plain number (no currency, no thousands separators).
- date: the transfer date as YYYY-MM-DD in the Gregorian calendar. Thai slips often print the Buddhist year (2569 or "69" means 2026) and Thai month abbreviations (ม.ค. ก.พ. มี.ค. เม.ย. พ.ค. มิ.ย. ก.ค. ส.ค. ก.ย. ต.ค. พ.ย. ธ.ค.); the day comes before the month.
- time: the transfer time as HH:MM, 24-hour (convert AM/PM; drop seconds).
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
    time: { type: ["string", "null"], description: "HH:MM, 24-hour" },
    reference: nullableString,
    senderName: nullableString,
    receiverName: nullableString,
    receiverAccount: nullableString,
    bank: nullableString,
  },
  required: ["isSlip", "amount", "date", "time", "reference", "senderName", "receiverName", "receiverAccount", "bank"],
};

const LEGACY_SCHEMA = {
  type: "OBJECT",
  properties: {
    isSlip: { type: "BOOLEAN" },
    amount: { type: "NUMBER", nullable: true },
    date: { type: "STRING", nullable: true },
    time: { type: "STRING", nullable: true },
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

export type SlipForm =
  | { ok: true; bytes: Buffer; mime: string; personRef: string }
  | { ok: false; status: number; code: string; message: string };

/** The uploaded slip picture (multipart `image`) and the `field` saying who paid. */
export async function readSlipForm(req: Request, field: string, maxRef = 100): Promise<SlipForm> {
  let file: File | null = null;
  let personRef = "";
  try {
    const form = await req.formData();
    const f = form.get("image");
    file = f instanceof File ? f : null;
    personRef = String(form.get(field) ?? "").slice(0, maxRef);
  } catch {
    /* handled below */
  }
  if (!file || !personRef) return { ok: false, status: 400, code: "bad_request", message: "Send the slip picture and who paid." };
  if (!TYPES.includes(file.type)) return { ok: false, status: 415, code: "bad_type", message: "Please upload a JPEG, PNG or WebP picture." };
  if (file.size > MAX_BYTES) return { ok: false, status: 413, code: "too_large", message: "That picture is too large." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageType(bytes); // what the bytes are, not what the phone said
  if (!mime) return { ok: false, status: 415, code: "bad_type", message: "Please upload a JPEG, PNG or WebP picture." };
  return { ok: true, bytes, mime, personRef };
}

export type SlipReadResult = { ok: true; slip: SlipRead } | { ok: false; status: number; code: string; message: string };

/**
 * Reads a slip picture with Gemini (three models race: slips are short and
 * often waited on). With `accept`, Flash-Lite joins the first three and its
 * answer is used straight away only if `accept` passes it.
 */
export async function readSlip(bytes: Buffer, mime: string, accept?: (slip: SlipRead) => boolean): Promise<SlipReadResult> {
  const r = await readImageJson({
    evt: "slip",
    prompt: PROMPT,
    schema: SCHEMA,
    legacySchema: LEGACY_SCHEMA,
    mime,
    data: bytes.toString("base64"),
    totalMs: 45_000,
    attemptMs: 12_000,
    startWith: 3,
    fastFirst: !!accept,
    accept:
      accept &&
      ((text) => {
        try {
          return accept(sanitizeSlip(extractJson(text)));
        } catch {
          return false;
        }
      }),
  });
  if (!r.ok) {
    if (r.reason === "not_configured") {
      return { ok: false, status: 503, code: "not_configured", message: "Slip checking isn't set up (GEMINI_API_KEY missing)." };
    }
    return { ok: false, status: 502, code: "read_failed", message: "Couldn't read the slip right now — try again in a minute." };
  }
  try {
    const slip = sanitizeSlip(extractJson(r.text));
    console.info(JSON.stringify({ evt: "slip", model: r.model, isSlip: slip.isSlip, hasRef: !!slip.reference, date: slip.date, hasTime: !!slip.time }));
    return { ok: true, slip };
  } catch {
    return { ok: false, status: 502, code: "read_failed", message: "Couldn't read the slip — try a clearer picture." };
  }
}

const TIME_PROMPT = `This is a Thai bank transfer slip. Return JSON with the moment the money was sent, as printed:
- date: the transfer date as YYYY-MM-DD in the Gregorian calendar (2569 or "69" means 2026; the day comes before the month).
- time: the transfer time as HH:MM, 24-hour (convert AM/PM; drop seconds).
Use null for anything not shown.`;

const TIME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { date: { type: ["string", "null"] }, time: { type: ["string", "null"] } },
  required: ["date", "time"],
};

const TIME_LEGACY_SCHEMA = {
  type: "OBJECT",
  properties: { date: { type: "STRING", nullable: true }, time: { type: "STRING", nullable: true } },
  required: ["date", "time"],
};

/**
 * When the money was sent, read off a stored slip picture (for slips kept before their time
 * was read), on the date already read from it. The ISO moment; null when the picture has gone
 * or shows no usable time (final); undefined when it couldn't be read just now (ask again).
 */
export async function readSlipTime(photo: string, date: string, budgetMs = 25_000): Promise<string | null | undefined> {
  const started = Date.now();
  const img = await readQrImage(photo);
  if (!img) return null;
  const mime = img.headers.get("content-type") ?? "image/jpeg";
  const bytes = Buffer.from(await img.arrayBuffer());
  const totalMs = Math.min(25_000, budgetMs - (Date.now() - started));
  if (totalMs < 3_000) return undefined;
  const r = await readImageJson({
    evt: "slip-time",
    prompt: TIME_PROMPT,
    schema: TIME_SCHEMA,
    legacySchema: TIME_LEGACY_SCHEMA,
    mime,
    data: bytes.toString("base64"),
    totalMs,
    attemptMs: Math.min(12_000, totalMs),
  });
  if (!r.ok) return undefined;
  try {
    const o = extractJson(r.text) as { date?: unknown; time?: unknown };
    // The date the slip was checked against; a time read on a different day is a misread.
    const day = receiptDate(o.date);
    if (day && day !== date) return null;
    return slipMoment(date, clockTime(o.time));
  } catch {
    return undefined; // a garbled answer
  }
}
