import { describe, expect, it } from "vitest";
import { isValidPromptPayId } from "./promptpay";
import { addFriend, findByName, markUsed, sameAsLastTime, sortFriends, toPeople, type Friend } from "./friends";
import { readJpegInfo, swapsAxes } from "./jpeg";
import { sanitizeScan, summariseFailure, type ScanAttempt } from "./scanResult";
import { promptPayPayload } from "./promptpay";
import { cleanScannedItems, isSummaryLine } from "./scanFilter";
import { applyScan, newDoc, totalMismatch } from "./draft";

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
  it("drops summary lines only on an exact keyword match", () => {
    const { items, dropped } = cleanScannedItems([
      { name: "Pad Thai", qty: 1, price: 120 },
      { name: "ข้าวผัดรวมมิตร", qty: 1, price: 80 }, // contains รวม but is a dish
      { name: "Tea (change to hot)", qty: 1, price: 40 },
      { name: "Service Set A", qty: 1, price: 199 }, // starts with "service" but is food
      { name: "Total Wipeout Burger", qty: 1, price: 259 },
      { name: "Subtotal", qty: 1, price: 240 },
      { name: "Service Charge 10%", qty: 1, price: 24 },
      { name: "VAT 7%", qty: 1, price: 18.48 },
      { name: "TOTAL:", qty: 1, price: 282.48 },
      { name: "Cash", qty: 1, price: 300 },
      { name: "Change", qty: 1, price: 17.52 },
      { name: "ยอดรวม", qty: 1, price: 282.48 },
      { name: "ภาษีมูลค่าเพิ่ม", qty: 1, price: 18.48 },
      { name: "เงินทอน", qty: 1, price: 17.52 },
      { name: "Free water", qty: 1, price: 0 },
      { name: "12345", qty: 1, price: 10 },
    ]);
    expect(items.map((i) => i.name)).toEqual([
      "Pad Thai",
      "ข้าวผัดรวมมิตร",
      "Tea (change to hot)",
      "Service Set A",
      "Total Wipeout Burger",
    ]);
    expect(dropped.filter((d) => d.reason === "summary_line")).toHaveLength(9);
    expect(dropped.map((d) => d.reason)).toEqual(expect.arrayContaining(["no_price", "no_text"]));
  });

  it("keeps negative lines (a discount on one item), even if named like a summary", () => {
    const { items } = cleanScannedItems([
      { name: "Tom Yum", qty: 1, price: 300 },
      { name: "ส่วนลด", qty: 1, price: -30 },
      { name: "Discount", qty: 1, price: -15 },
    ]);
    expect(items.map((i) => i.price)).toEqual([300, -30, -15]);
  });

  it("isSummaryLine ignores amounts, percentages and punctuation", () => {
    expect(isSummaryLine("Grand Total")).toBe(true);
    expect(isSummaryLine("ค่าบริการ 10%")).toBe(true);
    expect(isSummaryLine("Service Charge (10%) :")).toBe(true);
    expect(isSummaryLine("Totally Tofu")).toBe(false);
    expect(isSummaryLine("Cash & Carry Combo")).toBe(false);
  });
});

describe("sanitizeScan", () => {
  it("reads the camelCase contract, keeps negative item prices, and normalises the discount", () => {
    const r = sanitizeScan({
      items: [
        { name: " Beef Bowl ", qty: 2, price: 318 },
        { name: "Member discount", qty: 1, price: -20 },
        { name: "", qty: 1, price: 0 },
      ],
      subtotal: 1500,
      discount: -225,
      serviceCharge: null,
      vat: null,
      vatIncluded: true,
      total: "1,275.00",
      currency: "THB",
    });
    expect(r.items).toEqual([
      { name: "Beef Bowl", qty: 2, price: 318 },
      { name: "Member discount", qty: 1, price: -20 },
    ]);
    expect([r.discount, r.vatIncluded, r.total, r.currency]).toEqual([225, true, 1275, "THB"]);
  });

  it("still accepts older snake_case fields", () => {
    const r = sanitizeScan({ items: [], service_charge: 63, vat_included: true });
    expect([r.serviceCharge, r.vatIncluded]).toEqual([63, true]);
  });
});

describe("summariseFailure", () => {
  const a = (outcome: ScanAttempt["outcome"]): ScanAttempt => ({ model: "m", status: 0, outcome, ms: 1 });
  it("reports quota only when every model was out of quota, otherwise busy", () => {
    expect(summariseFailure([a("quota"), a("quota"), a("quota")])).toBe("quota");
    expect(summariseFailure([a("quota"), a("busy"), a("busy")])).toBe("busy");
    expect(summariseFailure([a("timeout"), a("quota")])).toBe("quota");
    expect(summariseFailure([a("busy"), a("api_error")])).toBe("api_error");
    expect(summariseFailure([a("timeout")])).toBe("timeout");
    expect(summariseFailure([])).toBe("network");
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

describe("applyScan + totalMismatch", () => {
  const doc = () => ({ ...newDoc(), people: [{ id: "me", name: "Me" }] });
  it("keeps a negative per-item discount line with its sign", () => {
    const r = applyScan(doc(), {
      items: [
        { name: "Tom Yum", qty: 1, price: 300 },
        { name: "ส่วนลด", qty: 1, price: -30 },
      ],
      subtotal: 270, serviceCharge: null, vat: null, vatIncluded: true, discount: null, total: 270, currency: "THB",
    });
    expect(r.doc.items.map((i) => [i.name, i.qty * i.price])).toEqual([
      ["Tom Yum", 30000],
      ["ส่วนลด", -3000],
    ]);
  });

  it("flags a printed total that doesn't match beyond ฿1 of rounding", () => {
    expect(totalMismatch(127500, 127500, "THB")).toBeNull();
    expect(totalMismatch(127550, 127500, "THB")).toBeNull(); // 50 satang = rounding
    expect(totalMismatch(131400, 127500, "THB")).toBe(3900);
    expect(totalMismatch(100, null, "THB")).toBeNull();
    expect(totalMismatch(1002, 1000, "JPY")).toBe(2);
  });
});
