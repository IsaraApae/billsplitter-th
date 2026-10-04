// Post-processing for scanned items. Pure.

export interface RawItem {
  name: string;
  qty: number;
  /** line total, major units; negative for a discount on one item */
  price: number;
}

export interface DroppedLine {
  name: string;
  reason: "no_price" | "summary_line" | "no_text";
}

// Whole-line summary labels. A line is only dropped when its *entire* name
// (ignoring amounts, percentages and punctuation) is one of these, so real
// dishes such as "Service Set A", "ข้าวผัดรวมมิตร" or "Tea (change to hot)" stay.
const SUMMARY = new Set(
  [
    // English
    "subtotal", "sub total", "sub-total", "total", "grand total", "net total", "total amount", "amount", "amount due",
    "balance", "balance due", "tax", "vat", "service", "service charge", "svc", "s/c", "sc", "cash", "change",
    "tender", "tendered", "paid", "payment", "card", "credit card", "credit", "visa", "master", "mastercard",
    "rounding", "round", "round off", "tip", "tips", "gratuity", "qr", "qr payment", "promptpay",
    // Thai
    "รวม", "ยอดรวม", "รวมเงิน", "รวมย่อย", "ยอดรวมย่อย", "รวมทั้งสิ้น", "รวมทั้งหมด", "ยอดสุทธิ", "สุทธิ", "ยอดชำระ",
    "ภาษี", "ภาษีมูลค่าเพิ่ม", "ค่าบริการ", "เซอร์วิส", "เงินสด", "เงินทอน", "ทอน", "รับเงิน", "ชำระ", "ชำระเงิน",
    "บัตร", "บัตรเครดิต", "ปัดเศษ",
  ].map((s) => s.normalize("NFC")),
);

/** Name with amounts, percentages and punctuation removed, lower-cased. */
function bareLabel(name: string): string {
  return name
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[\d.,]+\s*%?/g, " ") // amounts and "10%"
    .replace(/[:*#()[\]=\-–—_|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSummaryLine(name: string): boolean {
  return SUMMARY.has(bareLabel(name));
}

const HAS_LETTER = /[A-Za-zก-ฮÀ-ɏ぀-ヿ一-鿿가-힯]/;

/** Removes lines that can't be real purchased items. Negative lines (per-item discounts) are kept. */
export function cleanScannedItems(items: RawItem[]): { items: RawItem[]; dropped: DroppedLine[] } {
  const kept: RawItem[] = [];
  const dropped: DroppedLine[] = [];
  for (const it of items) {
    const name = it.name.replace(/\s+/g, " ").trim();
    if (!Number.isFinite(it.price) || it.price === 0) dropped.push({ name, reason: "no_price" });
    else if (!name || !HAS_LETTER.test(name)) dropped.push({ name, reason: "no_text" });
    else if (it.price > 0 && isSummaryLine(name)) dropped.push({ name, reason: "summary_line" });
    else kept.push({ ...it, name });
  }
  return { items: kept, dropped };
}
