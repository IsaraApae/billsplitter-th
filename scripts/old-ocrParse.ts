// Heuristic parser for raw OCR text (Tesseract fallback). Pure. Best-effort:
// the UI always shows an editable list afterwards.

export interface ParsedReceipt {
  items: { name: string; qty: number; price: number }[]; // price = line total, major units
  subtotal: number | null;
  serviceCharge: number | null;
  vat: number | null;
  total: number | null;
}

const PRICE_AT_END = /(-?\d{1,3}(?:[,\s]\d{3})+(?:[.,]\d{1,2})?|-?\d+[.,]\d{2}|-?\d+)\s*[A-Za-z฿]{0,3}\s*$/;
const QTY_PREFIX = /^\s*(\d{1,3})\s*[xX×@*]?\s+(?=\D)/;
const QTY_SUFFIX = /\s+[xX×]\s*(\d{1,3})\s*$/;

const KW = {
  subtotal: /sub\s*-?\s*total|ยอดรวมย่อย|รวมย่อย|รวมเงิน|รวมค่าอาหาร/i,
  service: /service|svc|s\/c|ค่าบริการ|เซอร์วิส/i,
  vat: /\bvat\b|tax|ภาษี|ภาษีมูลค่าเพิ่ม/i,
  total: /\btotal\b|grand|amount\s*due|ยอดสุทธิ|ยอดรวม|รวมทั้งสิ้น|ทั้งหมด|สุทธิ/i,
  skip: /\b(cash|change|card|visa|master\w*|qr|promptpay|discount|table|date|time|receipt|tel|tax\s*id|pax|guests?|cashier|rounding|tips?)\b|เงินสด|เงินทอน|รับเงิน|บัตร|ส่วนลด|โต๊ะ|วันที่|เวลา|ใบเสร็จ|โทร|เลขประจำตัว|พนักงาน|ปัดเศษ/i,
};

function toNumber(s: string): number {
  let t = s.replace(/\s/g, "");
  // "1,234.50" or "1.234,50"
  if (/,\d{1,2}$/.test(t) && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  return Number(t);
}

export function parseReceiptText(text: string): ParsedReceipt {
  const out: ParsedReceipt = { items: [], subtotal: null, serviceCharge: null, vat: null, total: null };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/[|]/g, " ").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1);

  for (const line of lines) {
    const m = line.match(PRICE_AT_END);
    if (!m) continue;
    const amount = toNumber(m[1]);
    if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) continue;
    let label = line.slice(0, m.index).trim().replace(/[.:\-–=]+$/, "").trim();

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
    if (KW.skip.test(label)) continue;

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
    // Drop a trailing unit price, e.g. "Beer 2 x 90.00 180.00"
    label = label.replace(/\s+\d+(?:[.,]\d{2})?\s*$/, "").trim();
    // Needs at least two letters (Latin or Thai) to count as an item name.
    if ((label.match(/[A-Za-z฀-๿]/g) ?? []).length < 2) continue;
    if (qty < 1 || qty > 999) qty = 1;
    // Tesseract prints no decimal point for whole numbers sometimes; ignore tiny noise like "1".
    if (amount === 0) continue;
    out.items.push({ name: label.slice(0, 80), qty, price: amount });
  }
  return out;
}
