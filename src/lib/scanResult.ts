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

export function sanitizeScan(raw: unknown): ScanResult {
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
