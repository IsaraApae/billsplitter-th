// Shape returned by /api/scan, plus a defensive sanitiser for model output. Pure.

export interface ScanAttempt {
  model: string;
  /** HTTP status from Gemini (0 = no response, e.g. timeout) */
  status: number;
  outcome: "ok" | "quota" | "busy" | "timeout" | "network" | "api_error" | "bad_output";
  ms: number;
}

export interface ScanResult {
  /** price = LINE total in major units; negative for a discount on a single item */
  items: { name: string; qty: number; price: number }[];
  subtotal: number | null;
  serviceCharge: number | null;
  vat: number | null;
  vatIncluded: boolean;
  /** receipt-wide discount, positive */
  discount: number | null;
  total: number | null;
  currency: string | null;
  /** date printed on the receipt, YYYY-MM-DD (Gregorian); null if none or implausible */
  date?: string | null;
  /** shop or restaurant name, for the split's title */
  merchant?: string | null;
  /** model that produced the result */
  model?: string;
  /** every Gemini call made for this scan, in order */
  attempts?: ScanAttempt[];
}

const LIMIT = 1e9;

/** A finite number within ±LIMIT (strings like "1,234.50" or "-45" are accepted). */
function num(v: unknown, allowNegative = false): number | null {
  let n: number | null = null;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && v.trim()) {
    const negative = /^\s*-|-\s*$/.test(v); // "-45" or "45.00-"
    const parsed = Number(v.replace(/[^\d.]/g, ""));
    n = Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
  }
  if (n === null || !Number.isFinite(n) || Math.abs(n) >= LIMIT) return null;
  if (n < 0 && !allowNegative) return null;
  return n;
}

/** Extracts the JSON object from model text (tolerates ``` fences / prose). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in response");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * A receipt date as YYYY-MM-DD, or null. Converts a Buddhist-era year
 * (2569 → 2026) and rejects impossible dates, dates in the future and dates
 * more than five years old (a misread is likelier than a bill that old).
 */
export function receiptDate(v: unknown, now = new Date()): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v.trim());
  if (!m) return null;
  const [mo, d] = [Number(m[2]), Number(m[3])];
  const y = Number(m[1]) >= 2400 ? Number(m[1]) - 543 : Number(m[1]);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  // One day of slack: the server's "today" (UTC) can be behind Thailand's.
  const latest = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const oldest = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
  if (date > latest || date < oldest) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function sanitizeScan(raw: unknown, now = new Date()): ScanResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(o.items) ? o.items : [];
  const items = rawItems
    .slice(0, 200)
    .map((r) => {
      const it = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const name = typeof it.name === "string" ? it.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
      const qtyN = num(it.qty);
      const qty = qtyN && qtyN >= 1 && qtyN <= 999 ? Math.round(qtyN) : 1;
      return { name, qty, price: num(it.price, true) ?? 0 };
    })
    .filter((it) => it.name !== "" || it.price !== 0);
  const currency = typeof o.currency === "string" && /^[A-Z]{3}$/.test(o.currency) ? o.currency : null;
  // camelCase is the contract; snake_case is accepted from older responses.
  const discount = num(o.discount, true);
  return {
    items,
    subtotal: num(o.subtotal),
    serviceCharge: num(o.serviceCharge ?? o.service_charge),
    vat: num(o.vat),
    vatIncluded: (o.vatIncluded ?? o.vat_included) === true,
    discount: discount === null ? null : Math.abs(discount),
    total: num(o.total),
    currency,
    date: receiptDate(o.date, now),
    merchant: typeof o.merchant === "string" && o.merchant.trim() ? o.merchant.replace(/\s+/g, " ").trim().slice(0, 60) : null,
  };
}

export type FailureReason = Exclude<ScanAttempt["outcome"], "ok">;

/**
 * The most useful reason to show when every attempt failed:
 * an unreadable photo (api_error) first, then quota if every model was out of
 * quota, then busy, then quota, then timeout, then network.
 */
export function summariseFailure(attempts: ScanAttempt[]): FailureReason {
  const has = (o: ScanAttempt["outcome"]) => attempts.some((a) => a.outcome === o);
  if (has("api_error")) return "api_error";
  if (has("bad_output")) return "bad_output";
  if (attempts.length > 0 && attempts.every((a) => a.outcome === "quota")) return "quota";
  if (has("busy")) return "busy";
  if (has("quota")) return "quota";
  if (has("timeout")) return "timeout";
  return "network";
}
