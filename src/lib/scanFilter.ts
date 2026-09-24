// Post-processing for scanned items, whichever engine produced them. Pure.

export interface RawItem {
  name: string;
  qty: number;
  price: number; // line total, major units
}

export interface DroppedLine {
  name: string;
  reason: "no_price" | "summary_line" | "no_text";
}

// Lines that are receipt summaries rather than purchases. Anchored at the
// start of the name so real dishes like "ข้าวผัดรวมมิตร" or "Tea (change to hot)" survive.
const SUMMARY_EN =
  /^\s*(sub\s*-?\s*total|total|grand\s*total|net\s*total|amount(\s*due)?|balance|tax|vat|service(\s*charge)?|svc|s\/c|cash|change|tender(ed)?|paid|payment|card|credit|visa|master\s*card|discount|rounding|round|tips?|gratuity|qr\s*pay|promptpay)\b/i;
const SUMMARY_TH =
  /^\s*(รวมย่อย|รวมเงิน|รวมทั้งสิ้น|รวมทั้งหมด|ยอดรวม|ยอดสุทธิ|ยอดชำระ|สุทธิ|รวม\s*$|ภาษี|ค่าบริการ|เซอร์วิส|เงินสด|เงินทอน|ทอน|รับเงิน|ส่วนลด|ชำระ|บัตร|ปัดเศษ)/;

export function isSummaryLine(name: string): boolean {
  return SUMMARY_EN.test(name) || SUMMARY_TH.test(name);
}

const HAS_LETTER = /[A-Za-zก-ฮÀ-ɏ぀-ヿ一-鿿가-힯]/;

/** Removes lines that can't be real purchased items. */
export function cleanScannedItems(items: RawItem[]): { items: RawItem[]; dropped: DroppedLine[] } {
  const kept: RawItem[] = [];
  const dropped: DroppedLine[] = [];
  for (const it of items) {
    const name = it.name.replace(/\s+/g, " ").trim();
    if (!Number.isFinite(it.price) || it.price <= 0) dropped.push({ name, reason: "no_price" });
    else if (!name || !HAS_LETTER.test(name)) dropped.push({ name, reason: "no_text" });
    else if (isSummaryLine(name)) dropped.push({ name, reason: "summary_line" });
    else kept.push({ ...it, name });
  }
  return { items: kept, dropped };
}
