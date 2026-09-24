import { describe, expect, it } from "vitest";
import { isValidPromptPayId } from "./promptpay";
import { addFriend, findByName, markUsed, sameAsLastTime, sortFriends, toPeople, type Friend } from "./friends";
import { readJpegInfo, swapsAxes } from "./jpeg";
import { filterOcrLines, isWellFormedThai, parseReceiptText, type OcrLine } from "./ocrParse";
import { promptPayPayload } from "./promptpay";
import { cleanScannedItems, isSummaryLine } from "./scanFilter";

/** Independent CRC-16/CCITT-FALSE reference to check the library's output. */
function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

it("CRC reference matches the standard check value", () => expect(crc16("123456789")).toBe("29B1"));

describe("cleanScannedItems", () => {
  it("drops summary, payment and price-less lines but keeps real dishes", () => {
    const { items, dropped } = cleanScannedItems([
      { name: "Pad Thai", qty: 1, price: 120 },
      { name: "ข้าวผัดรวมมิตร", qty: 1, price: 80 }, // contains รวม but is a dish
      { name: "Tea (change to hot)", qty: 1, price: 40 },
      { name: "Subtotal", qty: 1, price: 240 },
      { name: "Service Charge 10%", qty: 1, price: 24 },
      { name: "VAT 7%", qty: 1, price: 18.48 },
      { name: "TOTAL", qty: 1, price: 282.48 },
      { name: "Cash", qty: 1, price: 300 },
      { name: "Change", qty: 1, price: 17.52 },
      { name: "ยอดรวม", qty: 1, price: 282.48 },
      { name: "ภาษีมูลค่าเพิ่ม", qty: 1, price: 18.48 },
      { name: "เงินทอน", qty: 1, price: 17.52 },
      { name: "Free water", qty: 1, price: 0 },
      { name: "12345", qty: 1, price: 10 },
    ]);
    expect(items.map((i) => i.name)).toEqual(["Pad Thai", "ข้าวผัดรวมมิตร", "Tea (change to hot)"]);
    expect(dropped.map((d) => d.reason)).toContain("no_price");
    expect(dropped.map((d) => d.reason)).toContain("no_text");
    expect(dropped.filter((d) => d.reason === "summary_line")).toHaveLength(9);
  });

  it("recognises summary lines in both languages", () => {
    expect(isSummaryLine("Grand Total")).toBe(true);
    expect(isSummaryLine("ค่าบริการ 10%")).toBe(true);
    expect(isSummaryLine("Totally Tofu")).toBe(false);
    expect(isSummaryLine("ส้มตำ")).toBe(false);
  });
});

describe("Tesseract confidence filter", () => {
  const w = (text: string, confidence = 90) => ({ text, confidence });
  const line = (words: { text: string; confidence: number }[], confidence = 90): OcrLine => ({
    text: words.map((x) => x.text).join(" "),
    confidence,
    words,
  });

  it("flags malformed Thai noise and keeps real Thai", () => {
    expect(isWellFormedThai("ต้มยำกุ้ง")).toBe(true);
    expect(isWellFormedThai("ข้าวผัด")).toBe(true);
    expect(isWellFormedThai("เบียร์")).toBe(true);
    expect(isWellFormedThai("่้ิ")).toBe(false); // marks with no consonant
    expect(isWellFormedThai("เ")).toBe(false); // leading vowel with nothing after
    expect(isWellFormedThai("ก")).toBe(false); // lone character
    expect(isWellFormedThai("Beer")).toBe(true);
  });

  it("drops low-confidence words/lines and lines without a price", () => {
    const text = filterOcrLines([
      line([w("Pad"), w("Thai"), w("120.00")]),
      line([w("ต้มยำกุ้ง"), w("ฺ่ิ", 91), w("300.00")]), // noise word inside a real line
      line([w("ํฺ๊", 40), w("ฏ", 35), w("11.00", 50)], 45), // noisy line
      line([w("SOMTAM"), w("HOUSE")]), // no price
      line([w("Subtotal"), w("420.00")]),
      line([w("Beer", 30), w("90.00")], 70), // low-confidence word dropped
    ]);
    expect(text.split("\n")).toEqual(["Pad Thai 120.00", "ต้มยำกุ้ง 300.00", "Subtotal 420.00", "90.00"]);
    const parsed = parseReceiptText(text);
    expect(parsed.items.map((i) => i.name)).toEqual(["Pad Thai", "ต้มยำกุ้ง"]);
    expect(parsed.subtotal).toBe(420);
  });
});

describe("receipt parser details (from the Yoshinoya test receipt)", () => {
  it("handles @unit prices, trailing '-' discounts, '*' flags, key: value lines and VAT-included notes", () => {
    const r = parseReceiptText(
      [
        "STORE : 26029",
        "1 Beef Bowl(L) E 189.00",
        "2 Beef Bowl(R) E @159.00 318.00",
        "3 Tokusei 3 E @79.00 237.00",
        "UOB 15%/450 225.00-",
        "Sub Total 1,500.00",
        "Total: 1,275.00 *",
        "Payment 1,275.00 *",
        "Trace No: 039370",
        "Points Balance: 1158 Pts",
        "VAT TNCLUDED/Thank You",
      ].join("\n"),
    );
    expect(r.items).toEqual([
      { name: "Beef Bowl(L) E", qty: 1, price: 189 },
      { name: "Beef Bowl(R) E", qty: 2, price: 318 },
      { name: "Tokusei 3 E", qty: 3, price: 237 },
    ]);
    expect(r.discount).toBe(225);
    expect(r.subtotal).toBe(1500);
    expect(r.total).toBe(1275);
    expect(r.vatIncluded).toBe(true);
  });
});

describe("JPEG orientation", () => {
  function jpeg(orientation: number | null, w = 400, h = 300, little = false): ArrayBuffer {
    const bytes: number[] = [0xff, 0xd8];
    if (orientation !== null) {
      const u16 = (n: number) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
      const u32 = (n: number) =>
        little ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
      const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
      const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
      bytes.push(0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload);
    }
    bytes.push(0xff, 0xc0, 0, 17, 8, h >> 8, h & 0xff, w >> 8, w & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
    bytes.push(0xff, 0xd9);
    return new Uint8Array(bytes).buffer;
  }

  it("reads orientation and stored size (big and little endian)", () => {
    expect(readJpegInfo(jpeg(6))).toEqual({ orientation: 6, width: 400, height: 300 });
    expect(readJpegInfo(jpeg(3, 640, 480, true))).toEqual({ orientation: 3, width: 640, height: 480 });
    expect(readJpegInfo(jpeg(null))).toEqual({ orientation: 1, width: 400, height: 300 });
    expect(readJpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull();
    expect(swapsAxes(6)).toBe(true);
    expect(swapsAxes(3)).toBe(false);
  });
});

describe("PromptPay (promptpay-qr library)", () => {
  it("builds a valid dynamic payload with amount and a correct CRC", () => {
    const p = promptPayPayload("081-234-5678", 15050);
    expect(p).toContain("0016A000000677010111");
    expect(p).toContain("01130066812345678");
    expect(p).toContain("5406150.50");
    expect(p).toContain("010212");
    expect(p.slice(-8, -4)).toBe("6304");
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });

  it("builds a static payload for a national ID", () => {
    const p = promptPayPayload("1234567890123");
    expect(p).toContain("02131234567890123");
    expect(p).toContain("010211");
    expect(p).not.toContain("5406");
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });

  it("validates ids", () => {
    expect(isValidPromptPayId("0812345678")).toBe(true);
    expect(isValidPromptPayId("1234567890123")).toBe(true);
    expect(isValidPromptPayId("12345")).toBe(false);
  });
});

describe("friends", () => {
  const base: Friend[] = [
    { id: "a", name: "Ann", lastUsed: 100 },
    { id: "b", name: "Bee", lastUsed: 300 },
    { id: "c", name: "Cat", lastUsed: 0 },
    { id: "d", name: "Aom", lastUsed: 0 },
  ];

  it("sorts by most recently used, then name, with search", () => {
    expect(sortFriends(base).map((f) => f.id)).toEqual(["b", "a", "d", "c"]);
    expect(sortFriends(base, "a").map((f) => f.id)).toEqual(["a", "d", "c"]); // Ann (used) first, then Aom, Cat alphabetically
    expect(sortFriends(base, "  BEE ").map((f) => f.id)).toEqual(["b"]);
  });

  it("adds without duplicating names", () => {
    const r1 = addFriend(base, { name: " ann " }, "x");
    expect(r1.created).toBe(false);
    expect(r1.friend.id).toBe("a");
    const r2 = addFriend(base, { name: "Dan", emoji: "🍜" }, "x");
    expect(r2.created).toBe(true);
    expect(r2.friends).toHaveLength(5);
    expect(findByName(r2.friends, "dan")?.emoji).toBe("🍜");
  });

  it("marks usage, restores last crew and builds people with Me first", () => {
    const used = markUsed(base, ["c"], 999);
    expect(sortFriends(used)[0].id).toBe("c");
    expect(sameAsLastTime(base, ["a", "gone", "c"])).toEqual(["a", "c"]);
    const people = toPeople({ name: "" }, [base[1]]);
    expect(people.map((p) => [p.id, p.name])).toEqual([
      ["me", "Me"],
      ["b", "Bee"],
    ]);
  });
});
