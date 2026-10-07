import { describe, expect, it } from "vitest";
import { backupSummary, makeBackup, mergeBackup, parseBackup } from "./backup";
import { billDate, billDay, newDoc, splitItem } from "./draft";
import { calculate } from "./calc";
import { formatMoney, parseMoney, percentToBp } from "./money";
import { parseSplitDoc } from "./schema";
import { splitVersion } from "./shareVersion";
import { accountNumber, isValidPromptPayId, normalizePromptPayInput } from "./promptpay";

describe("money", () => {
  it("parses user input into minor units", () => {
    expect(parseMoney("1,234.50", "THB")).toBe(123450);
    expect(parseMoney("฿ 99", "THB")).toBe(9900);
    expect(parseMoney("0.1", "THB")).toBe(10);
    expect(parseMoney("10.005", "THB")).toBe(1001);
    expect(parseMoney("1200", "JPY")).toBe(1200);
    expect(parseMoney(12.34, "USD")).toBe(1234);
    expect(parseMoney("abc", "THB")).toBeNull();
    expect(parseMoney("-5", "THB")).toBeNull();
  });

  it("formats minor units", () => {
    expect(formatMoney(123450, "THB")).toBe("฿1,234.50");
    expect(formatMoney(1200, "JPY")).toBe("¥1,200");
  });

  it("converts percent to basis points", () => {
    expect(percentToBp(7)).toBe(700);
    expect(percentToBp(12.5)).toBe(1250);
  });
});

describe("negative money input (discount lines)", () => {
  it("parses a leading minus only when allowed", () => {
    expect(parseMoney("-30", "THB", true)).toBe(-3000);
    expect(parseMoney("−12.50", "THB", true)).toBe(-1250);
    expect(parseMoney("-30", "THB")).toBeNull();
  });
});

describe("PromptPay number input", () => {
  it.each([
    ["0812345678", "0812345678"],
    ["081-234-5678", "0812345678"],
    ["๐๘๑๒๓๔๕๖๗๘", "0812345678"],
    ["+66 81 234 5678", "0812345678"],
    ["66812345678", "0812345678"],
    ["0066812345678", "0812345678"],
    ["０８１２３４５６７８", "0812345678"],
    ["1-2345-67890-12-3", "1234567890123"],
  ])("%s → %s", (typed, stored) => {
    expect(normalizePromptPayInput(typed)).toBe(stored);
    expect(isValidPromptPayId(normalizePromptPayInput(typed))).toBe(true);
  });

  it("rejects bank account numbers", () => {
    // 10 digits, but not a mobile number: must not become a PromptPay QR.
    for (const acct of ["0123456789", "0451234567", "1234567890", "123-4-56789-0"]) {
      expect(isValidPromptPayId(normalizePromptPayInput(acct))).toBe(false);
    }
    for (const mobile of ["0612345678", "0812345678", "0912345678"]) expect(isValidPromptPayId(mobile)).toBe(true);
  });

  it("leaves IDs that only look international alone", () => {
    // 13-digit national IDs can start with 66; they must not be rewritten.
    expect(normalizePromptPayInput("6612345678901")).toBe("6612345678901");
    expect(normalizePromptPayInput("1234567890123456")).toBe("123456789012345");
  });
});

describe("bill date", () => {
  it("defaults to the day the split was started", () => {
    const doc = newDoc();
    const started = new Date(doc.createdAt);
    expect(billDay(doc)).toBe(
      `${started.getFullYear()}-${String(started.getMonth() + 1).padStart(2, "0")}-${String(started.getDate()).padStart(2, "0")}`,
    );
  });

  it("uses the picked date, at local midnight", () => {
    const d = billDate({ ...newDoc(), date: "2026-09-28" });
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 8, 28, 0]);
  });

  it("is saved with the split, and rejects junk", () => {
    const valid = {
      ...newDoc(),
      people: [{ id: "me", name: "Me" }],
      items: [{ id: "i1", name: "Rice", qty: 1, price: 5000, assigned: ["me"] }],
    };
    const ok = parseSplitDoc({ ...valid, date: "2026-09-28" });
    expect(ok.ok ? ok.doc.date : ok.error).toBe("2026-09-28");
    expect(parseSplitDoc({ ...valid, date: "28/09/2026" }).ok).toBe(false);
  });
});

describe("backup", () => {
  const h = (id: string) => ({ id, title: id, createdAt: "2026-10-01T00:00:00.000Z", total: 1, currency: "THB", people: 1, paid: 0 });
  const backup = makeBackup(
    {
      "bs:profile": { name: "Isara", qrMode: "upload", promptpay: "", note: "", ownerId: "o1", ownerToken: "t1", qrVersion: 3 },
      "bs:friends": [{ id: "f1", name: "Mint" }, { id: "f2", name: "Ploy" }],
      "bs:history": [h("s1"), h("s2")],
      "bs:tokens": { s1: "x1", s2: "x2" },
    },
    new Date(2026, 9, 5),
  );

  it("round-trips through a file and rejects other files", () => {
    expect(parseBackup(JSON.stringify(backup))?.data["bs:tokens"]).toEqual({ s1: "x1", s2: "x2" });
    expect(parseBackup("{}")).toBeNull();
    expect(parseBackup("not json")).toBeNull();
    expect(backupSummary(backup)).toEqual({ splits: 2, friends: 2 });
  });

  it("on a new phone, restores everything", () => {
    const m = mergeBackup({}, backup.data);
    expect(m["bs:profile"]).toEqual(backup.data["bs:profile"]);
    expect((m["bs:history"] as { id: string }[]).map((x) => x.id)).toEqual(["s1", "s2"]);
  });

  it("adds without removing, and keeps this phone's Me settings", () => {
    const m = mergeBackup(
      {
        "bs:profile": { name: "Isara (new phone)", qrMode: "none", promptpay: "", note: "" },
        "bs:history": [h("s2"), h("s3")],
        "bs:tokens": { s3: "x3" },
      },
      backup.data,
    );
    expect((m["bs:history"] as { id: string }[]).map((x) => x.id)).toEqual(["s2", "s3", "s1"]);
    expect(m["bs:tokens"]).toEqual({ s1: "x1", s2: "x2", s3: "x3" });
    // The name stays; the uploaded QR from the old phone is adopted.
    expect(m["bs:profile"]).toMatchObject({ name: "Isara (new phone)", ownerId: "o1", ownerToken: "t1", qrMode: "upload" });
  });
});

describe("split an item into separate lines", () => {
  const doc = {
    ...newDoc(),
    people: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ],
    items: [
      { id: "rice", name: "Rice", qty: 1, price: 5000, assigned: ["a"] },
      { id: "w", name: "Water", qty: 2, price: 2000, assigned: ["a", "b", "c"] },
    ],
  };

  it("makes one line per unit, keeping the price and people", () => {
    const d = splitItem(doc, "w");
    expect(d.items.map((i) => [i.name, i.qty, i.price])).toEqual([
      ["Rice", 1, 5000],
      ["Water (1)", 1, 2000],
      ["Water (2)", 1, 2000],
    ]);
    expect(d.items[1].id).toBe("w");
    expect(d.items[2].assigned).toEqual(["a", "b", "c"]);
  });

  it("then each bottle can be shared by different people", () => {
    const d = splitItem(doc, "w");
    d.items[1] = { ...d.items[1], assigned: ["a", "b"] };
    const r = calculate(d);
    const [a, b, c] = r.people.map((p) => p.total);
    // A and B: half of bottle 1 plus a third of bottle 2; C: a third of bottle 2 (to the satang).
    expect(Math.abs(a - 5000 - 1667)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 1667)).toBeLessThanOrEqual(1);
    expect(Math.abs(c - 667)).toBeLessThanOrEqual(1);
    expect(a + b + c).toBe(r.total);
  });

  it("keeps the new lines in a discount on selected items", () => {
    const d = splitItem({ ...doc, discount: { ...doc.discount, scope: "selected", itemIds: ["w"] } }, "w");
    expect(d.discount.itemIds).toHaveLength(2);
  });
});

describe("share link version", () => {
  it("changes when the bill's title changes, so link previews refresh", () => {
    const doc = { ...newDoc(), title: "Dinner", people: [{ id: "me", name: "Me" }] };
    expect(splitVersion(doc)).toBe(splitVersion({ ...doc }));
    expect(splitVersion({ ...doc, title: "Dinner at Baan Suan" })).not.toBe(splitVersion(doc));
  });
});

describe("copying bank details", () => {
  it("copies just the account number's digits", () => {
    expect(accountNumber("KBank 181-1-91964-7")).toBe("1811919647");
    expect(accountNumber("กสิกร 181 1 91964 7 อิสรา")).toBe("1811919647");
    expect(accountNumber("SCB 123-456789-0\nor cash")).toBe("1234567890");
  });

  it("leaves notes without an account number alone", () => {
    expect(accountNumber("Pay me in cash")).toBeNull();
    expect(accountNumber("Table 14, 2 people")).toBeNull();
  });
});
