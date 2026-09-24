// Heuristic parser for raw OCR text (Tesseract fallback). Pure. Best-effort:
// the UI always shows an editable list afterwards.

export interface ParsedReceipt {
  items: { name: string; qty: number; price: number }[]; // price = line total, major units
  subtotal: number | null;
  serviceCharge: number | null;
  vat: number | null;
  discount: number | null;
  total: number | null;
  vatIncluded: boolean;
}

// A price at the end of a line, optionally followed by a minus (discount),
// a currency marker, or receipt flags like "*".
// (Spaces are not treated as thousands separators: "15%/450 225.00-" is 225.00.)
const PRICE_AT_END =
  /(-?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|-?\d+[.,]\d{2}|-?\d+)\s*(-)?\s*(?:฿|THB|บาท|B)?[\s*#]*$/;
const DECIMAL_PRICE = /\d[.,]\d{2}$/;
const QTY_PREFIX = /^\s*(\d{1,3})\s*[xX×@*]?\s+(?=\D)/;
const QTY_SUFFIX = /\s+[xX×]\s*(\d{1,3})\s*$/;
const UNIT_PRICE_SUFFIX = /\s*(?:@\s*\d+(?:[.,]\d{1,2})?|\d+[.,]\d{2})\s*$/;

const KW = {
  subtotal: /sub\s*-?\s*total|ยอดรวมย่อย|รวมย่อย|รวมเงิน|รวมค่าอาหาร/i,
  service: /service|svc|s\/c|ค่าบริการ|เซอร์วิส/i,
  vat: /\bvat\b|\btax\b|ภาษี|ภาษีมูลค่าเพิ่ม/i,
  total: /\btotal\b|grand|amount\s*due|ยอดสุทธิ|ยอดรวม|รวมทั้งสิ้น|ทั้งหมด|สุทธิ/i,
  discount: /\bdiscount\b|\bdisc\b|ส่วนลด/i,
  skip: /\b(cash|change|card|visa|master\w*|qr|promptpay|payment|paid|table|tbl|date|time|receipt|tel|tax\s*id|pax|guests?|cashier|rounding|tips?|trace|inv|invoice|order|member|points?|balance|store|pos)\b|เงินสด|เงินทอน|รับเงิน|บัตร|โต๊ะ|วันที่|เวลา|ใบเสร็จ|โทร|เลขประจำตัว|พนักงาน|ปัดเศษ|สมาชิก|คะแนน/i,
};

// Tolerates one OCR slip in "INCLUDED" (e.g. "TNCLUDED", "lNCLUDED").
const VAT_INCLUDED =
  /\bv\W?a\W?t\b\W{0,3}\w?nclud|vat\s*incl|incl(?:uding|\.|usive)?\s*(?:of\s*)?vat|tax\s*incl|รวมภาษีมูลค่าเพิ่มแล้ว|ราคารวมภาษี|รวม\s*vat/i;

/** Receipts that say prices already include VAT (so VAT must not be added again). */
export function detectVatIncluded(text: string): boolean {
  return VAT_INCLUDED.test(text);
}

// ---- Confidence filtering for Tesseract output -------------------------------

export interface OcrWord {
  text: string;
  confidence: number; // 0–100
}

export interface OcrLine {
  text: string;
  confidence: number;
  words: OcrWord[];
}

export const MIN_WORD_CONFIDENCE = 60;
export const MIN_LINE_CONFIDENCE = 65;

const THAI_CONSONANT = /[ก-ฮ]/;
const THAI_MARK = /[ัิ-ฺ็-๎]/; // above/below vowels & tone marks
const THAI_LEADING_VOWEL = /[เ-ไ]/;

/**
 * Tesseract's Thai model turns paper texture, logos and ruled lines into
 * Thai-looking noise. Real Thai follows simple rules: marks sit on a
 * consonant (at most two stacked) and leading vowels precede a consonant.
 */
export function isWellFormedThai(word: string): boolean {
  const chars = [...word];
  let stacked = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (THAI_MARK.test(c)) {
      const prev = chars[i - 1] ?? "";
      if (!(THAI_CONSONANT.test(prev) || (THAI_MARK.test(prev) && stacked < 2))) return false;
      stacked = THAI_MARK.test(prev) ? stacked + 1 : 1;
    } else {
      stacked = 0;
      if (THAI_LEADING_VOWEL.test(c) && !THAI_CONSONANT.test(chars[i + 1] ?? "")) return false;
    }
  }
  // A lone Thai character (e.g. "ก", "ๆ") is almost always noise on a receipt.
  const thai = chars.filter((c) => /[฀-๿]/.test(c)).length;
  return thai === 0 || thai >= 2;
}

const PRICE_WORD = /^-?(\d{1,3}(,\d{3})+(\.\d{1,2})?|\d+[.,]\d{2})-?\*?$/;
const QTY_WORD = /^\d{1,3}$/;
const LATIN_WORD = /[A-Za-z]{2,}/;
const THAI_CHAR = /[฀-๿]/g;
const SYMBOLS_ONLY = /^[^\p{L}\p{N}]+$/u;

/**
 * Cleans one OCR line at word level:
 * - cuts everything after the last price (edge noise like "189.00 gh"),
 * - drops symbol-only junk and anything before a leading quantity,
 * - drops malformed Thai and tiny Thai fragments inside Latin lines,
 * - drops low-confidence words; the line must stay confident on average.
 * Returns null when nothing trustworthy is left.
 */
export function cleanOcrLine(line: OcrLine, requirePrice: boolean): string | null {
  let words = line.words.filter((w) => w.text.trim() && !SYMBOLS_ONLY.test(w.text));
  const priceAt = words.map((w) => PRICE_WORD.test(w.text)).lastIndexOf(true);
  if (priceAt >= 0) words = words.slice(0, priceAt + 1);
  else if (requirePrice) return null;

  const latinLine = words.filter((w) => LATIN_WORD.test(w.text)).length >= 2;
  const priceWord = priceAt >= 0 ? words[words.length - 1] : null;
  words = words.filter((w) => {
    if (w === priceWord) return w.confidence >= MIN_WORD_CONFIDENCE - 15;
    if (w.confidence < MIN_WORD_CONFIDENCE || !isWellFormedThai(w.text)) return false;
    const thai = (w.text.match(THAI_CHAR) ?? []).length;
    return !(latinLine && thai > 0 && thai <= 2);
  });
  // Leading noise before a quantity column ("Ee | 1 Kimchi E" → "1 Kimchi E").
  const qtyAt = words.slice(0, 3).findIndex((w) => QTY_WORD.test(w.text));
  if (qtyAt > 0 && words.slice(0, qtyAt).every((w) => w.text.length <= 3)) words = words.slice(qtyAt);

  if (!words.length || (requirePrice && (!priceWord || !words.includes(priceWord)))) return null;
  const mean = words.reduce((a, w) => a + w.confidence, 0) / words.length;
  if (mean < MIN_LINE_CONFIDENCE) return null;
  return words.map((w) => w.text).join(" ");
}

/**
 * Keeps only confident, well-formed words, drops low-confidence lines, and
 * keeps only lines that end with a price. Returns plain text for the parser.
 */
export function filterOcrLines(lines: OcrLine[]): string {
  return lines
    .map((l) => cleanOcrLine(l, true))
    .filter((t): t is string => t !== null)
    .join("\n");
}

/** All confident text (price or not) — used for "VAT included" style notes. */
export function confidentOcrText(lines: OcrLine[]): string {
  return lines
    .map((l) => cleanOcrLine(l, false))
    .filter((t): t is string => t !== null)
    .join("\n");
}

// ---- Line parser -------------------------------------------------------------

function toNumber(s: string): number {
  let t = s.replace(/\s/g, "");
  // "1,234.50" or "1.234,50"
  if (/,\d{1,2}$/.test(t) && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  return Number(t);
}

export function parseReceiptText(text: string): ParsedReceipt {
  const out: ParsedReceipt = {
    items: [],
    subtotal: null,
    serviceCharge: null,
    vat: null,
    discount: null,
    total: null,
    vatIncluded: detectVatIncluded(text),
  };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/[|]/g, " ").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1);

  // If the receipt prints decimal prices, bare integers at a line end are
  // IDs, times or points — not prices.
  const decimalLines = lines.filter((l) => {
    const m = l.match(PRICE_AT_END);
    return m && DECIMAL_PRICE.test(m[1]);
  }).length;
  const requireDecimals = decimalLines >= 2;

  for (const line of lines) {
    const m = line.match(PRICE_AT_END);
    if (!m) continue;
    if (requireDecimals && !DECIMAL_PRICE.test(m[1])) continue;
    const negative = m[1].startsWith("-") || m[2] === "-";
    const amount = toNumber(m[1].replace(/^-/, ""));
    if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) continue;
    let label = line.slice(0, m.index).trim().replace(/[.:\-–=]+$/, "").trim();
    const keyValue = /:\s*$/.test(line.slice(0, m.index).trim());

    if (negative || KW.discount.test(label)) {
      out.discount = (out.discount ?? 0) + amount;
      continue;
    }
    if (KW.subtotal.test(label)) {
      out.subtotal ??= amount;
      continue;
    }
    if (KW.service.test(label)) {
      out.serviceCharge ??= amount;
      continue;
    }
    if (KW.vat.test(label) && !KW.skip.test(label)) {
      out.vat ??= amount;
      continue;
    }
    if (KW.total.test(label)) {
      out.total = amount; // last "total" wins (grand total is usually lowest)
      continue;
    }
    if (KW.skip.test(label) || keyValue) continue;

    let qty = 1;
    const pre = label.match(QTY_PREFIX);
    const suf = label.match(QTY_SUFFIX);
    if (pre) {
      qty = Number(pre[1]);
      label = label.slice(pre[0].length);
    } else if (suf) {
      qty = Number(suf[1]);
      label = label.slice(0, suf.index);
    }
    // Drop a printed unit price, e.g. "Beer 2 x 90.00 180.00" or "Beef Bowl @159.00 318.00"
    label = label.replace(UNIT_PRICE_SUFFIX, "").trim();
    // Needs at least two letters (Latin or Thai) to count as an item name.
    if ((label.match(/[A-Za-z฀-๿]/g) ?? []).length < 2) continue;
    if (qty < 1 || qty > 999) qty = 1;
    if (amount === 0) continue;
    out.items.push({ name: label.slice(0, 80), qty, price: amount });
  }
  return out;
}
