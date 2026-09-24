// Pure money helpers. All amounts are integers in the currency's minor unit
// (satang for THB, cents for USD, yen for JPY).

export const CURRENCIES = [
  "THB", "USD", "EUR", "GBP", "JPY", "KRW", "CNY", "HKD", "TWD", "SGD",
  "MYR", "IDR", "PHP", "VND", "INR", "AUD", "NZD", "CAD", "CHF", "LAK",
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];

export function isCurrency(code: string): code is CurrencyCode {
  return (CURRENCIES as readonly string[]).includes(code);
}

const exponentCache = new Map<string, number>();

/** Number of minor-unit digits (2 for THB, 0 for JPY). */
export function currencyExponent(currency: string): number {
  let exp = exponentCache.get(currency);
  if (exp === undefined) {
    try {
      exp = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    } catch {
      exp = 2;
    }
    exponentCache.set(currency, exp);
  }
  return exp;
}

export function currencySymbol(currency: string): string {
  if (currency === "THB") return "฿";
  try {
    const part = new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Format minor units for display, e.g. 12345 THB -> "฿123.45". */
export function formatMoney(minor: number, currency: string): string {
  const exp = currencyExponent(currency);
  const major = minor / 10 ** exp;
  const sym = currencySymbol(currency);
  const num = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  }).format(Math.abs(major));
  return `${minor < 0 ? "−" : ""}${sym}${num}`;
}

/** Plain number without symbol, e.g. 12345 -> "123.45" (for inputs). */
export function toMajorString(minor: number, currency: string): string {
  const exp = currencyExponent(currency);
  return (minor / 10 ** exp).toFixed(exp);
}

/**
 * Parse user/OCR text into minor units. Accepts "1,234.50", "1234.5", "฿ 99".
 * Returns null for anything that is not a non-negative number.
 */
export function parseMoney(input: string | number, currency: string): number | null {
  const exp = currencyExponent(currency);
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) return null;
    return Math.round(input * 10 ** exp);
  }
  const cleaned = input.replace(/[^\d.,-]/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  const [whole, frac = ""] = cleaned.split(".");
  // Round half-up on the digit after the last minor digit, using string math to avoid float error.
  const padded = (frac + "0".repeat(exp + 1)).slice(0, exp + 1);
  let minor = Number(whole || "0") * 10 ** exp + Number(padded.slice(0, exp) || "0");
  if (Number(padded[exp] ?? "0") >= 5) minor += 1;
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Percent (e.g. 7 or 12.5) <-> basis points (700, 1250). */
export function percentToBp(pct: number): number {
  return Math.round(pct * 100);
}

export function bpToPercentString(bp: number): string {
  return String(bp / 100);
}
