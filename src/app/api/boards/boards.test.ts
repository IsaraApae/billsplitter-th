import { beforeEach, describe, expect, it, vi } from "vitest";
import { newDoc } from "@/lib/draft";
import type { SplitDoc } from "@/lib/types";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
// The receipt reader (Gemini) is stood in for: these tests are about who may ask and what's kept.
const { readReceiptTime } = vi.hoisted(() => ({
  readReceiptTime: vi.fn<(photo: string, day: string, budgetMs?: number) => Promise<string | null | undefined>>(),
}));
vi.mock("@/lib/server/receiptTime", () => ({ readReceiptTime }));

// No Redis settings in tests, so the routes run on the in-memory store.
const { boardFor, boardOfSplit, boardStarts, claimSplits, createSplit, fastestBoardOfSplit, getPayments, setPayment, startReading, doneReading } = await import(
  "@/lib/server/redis"
);
const hidden = await import("./[id]/hidden/route");
const receiptTimes = await import("./[id]/receipt-times/route");
const paidTimes = await import("./[id]/paid-times/route");

const doc = (extra: Partial<SplitDoc> = {}): SplitDoc => ({
  ...newDoc(),
  title: "Dinner",
  mode: "equal",
  people: [
    { id: "me", name: "Isara" },
    { id: "mint", name: "Mint" },
  ],
  items: [{ id: "i", name: "x", qty: 1, price: 100000, assigned: [] }],
  ...extra,
});

// Each request comes from its own address, so the rate limit never gets in a test's way.
let caller = 0;
const send = (method: string, body: unknown) =>
  new Request("http://test/api/boards", {
    method,
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.${Math.floor(caller / 250)}.${caller++ % 250}` },
    body: JSON.stringify(body),
  });
const at = (id: string) => ({ params: Promise.resolve({ id }) });

/** A bill as it was stored before share times were kept. */
function forgetShareTime(billId: string) {
  const store = (globalThis as unknown as { __bsMem: Map<string, { sharedAt?: string }> }).__bsMem;
  delete store.get(`split:${billId}`)!.sharedAt;
}

const OWNER = "phone-boards-test-01";
const STRANGER = "phone-boards-test-02";

describe("what counts in Who pays fastest (the organiser's sheet)", () => {
  it("is only for the phone the list belongs to", async () => {
    const list = await boardFor(OWNER);
    expect((await hidden.POST(send("POST", {}), at(list))).status).toBe(400);
    expect((await hidden.POST(send("POST", { owner: STRANGER }), at(list))).status).toBe(403);
    expect((await hidden.PUT(send("PUT", { owner: STRANGER, hidden: [] }), at(list))).status).toBe(403);
    expect((await hidden.POST(send("POST", { owner: OWNER }), at("not-a-list"))).status).toBe(404);
    expect((await hidden.POST(send("POST", { owner: OWNER }), at(list))).status).toBe(200);
  });

  it("refuses a start time in the future, saying so, and saves nothing", async () => {
    const list = await boardFor(OWNER);
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const r = await hidden.PUT(send("PUT", { owner: OWNER, hidden: [], starts: { AbCdEfGhIjKlMnOp: future } }), at(list));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("future_start");
    expect(await boardStarts(list)).toEqual({});
  });

  it("takes as many start times as it says it allows", async () => {
    const list = await boardFor(OWNER);
    const starts = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`bill${String(i).padStart(12, "0")}`, "2026-10-29T04:34:00.000Z"]));
    const r = await hidden.PUT(send("PUT", { owner: OWNER, hidden: [], starts }), at(list));
    expect(r.status).toBe(200);
    expect(Object.keys(await boardStarts(list))).toHaveLength(300);
    await hidden.PUT(send("PUT", { owner: OWNER, hidden: [] }), at(list));
  });

  it("switches the link on the organiser's bills off and on", async () => {
    const list = await boardFor(OWNER);
    const bill = await createSplit(doc());
    await claimSplits(OWNER, [bill]);
    expect(await fastestBoardOfSplit(bill.id)).toBe(list); // on until switched off
    expect((await (await hidden.POST(send("POST", { owner: OWNER }), at(list))).json()).onBills).toBe(true);

    await hidden.PUT(send("PUT", { owner: OWNER, hidden: [], onBills: false }), at(list));
    expect(await fastestBoardOfSplit(bill.id)).toBeNull();
    expect(await boardOfSplit(bill.id)).toBe(list); // the list itself is still theirs
    expect((await (await hidden.POST(send("POST", { owner: OWNER }), at(list))).json()).onBills).toBe(false);

    // A save that doesn't mention it (an older page still open) leaves it as it is.
    await hidden.PUT(send("PUT", { owner: OWNER, hidden: [] }), at(list));
    expect(await fastestBoardOfSplit(bill.id)).toBeNull();

    await hidden.PUT(send("PUT", { owner: OWNER, hidden: [], onBills: true }), at(list));
    expect(await fastestBoardOfSplit(bill.id)).toBe(list);
  });
});

describe("receipt times for older bills", () => {
  const READER = "phone-boards-test-03";
  beforeEach(() => readReceiptTime.mockReset());

  it("reads nothing for anyone but the organiser", async () => {
    const list = await boardFor(READER);
    expect((await receiptTimes.POST(send("POST", { owner: STRANGER }), at(list))).status).toBe(403);
    expect(readReceiptTime).not.toHaveBeenCalled();
  });

  it("reads each photo once, keeps what it found, and asks again only for what it couldn't read", async () => {
    const list = await boardFor(READER);
    const lunch = await createSplit(doc({ title: "Lunch", date: "2026-10-29", photo: "dev:r-00000000000000a1" }));
    const tea = await createSplit(doc({ title: "Tea", date: "2026-10-30", photo: "dev:r-00000000000000a2" }));
    const busy = await createSplit(doc({ title: "Busy", date: "2026-10-31", photo: "dev:r-00000000000000a3" }));
    const noPhoto = await createSplit(doc({ title: "No photo", date: "2026-10-31" }));
    const shared = await createSplit(doc({ title: "New", date: "2026-11-10", photo: "dev:r-00000000000000a4" }));
    await claimSplits(READER, [lunch, tea, busy, noPhoto, shared]);
    for (const b of [lunch, tea, busy, noPhoto]) forgetShareTime(b.id);

    const printed = "2026-10-29T04:34:00.000Z";
    readReceiptTime.mockImplementation(async (photo) => (photo.endsWith("a1") ? printed : photo.endsWith("a2") ? null : undefined));
    const first = await (await receiptTimes.POST(send("POST", { owner: READER }), at(list))).json();
    expect(first.times).toEqual({ [lunch.id]: printed });
    expect([...first.unread].sort()).toEqual([tea.id, noPhoto.id].sort()); // no time on it, and no photo
    expect(first.later).toEqual([busy.id]); // couldn't be read just now
    expect(readReceiptTime).toHaveBeenCalledTimes(3); // never the bill whose share time is kept

    // Asked again: only the one that couldn't be read is read; the rest is remembered.
    readReceiptTime.mockClear();
    readReceiptTime.mockResolvedValue("2026-10-31T12:00:00.000Z");
    const second = await (await receiptTimes.POST(send("POST", { owner: READER }), at(list))).json();
    expect(readReceiptTime).toHaveBeenCalledTimes(1);
    expect(second.times).toEqual({ [lunch.id]: printed, [busy.id]: "2026-10-31T12:00:00.000Z" });
    expect(second.later).toEqual([]);

    // Only the bills asked for.
    const third = await (await receiptTimes.POST(send("POST", { owner: READER, bills: [busy.id] }), at(list))).json();
    expect(third.times).toEqual({ [busy.id]: "2026-10-31T12:00:00.000Z" });
    expect(third.unread).toEqual([]);
  });

  it("says so while an earlier reading is still under way", async () => {
    const list = await boardFor(READER);
    expect(await startReading(list)).toBe(true);
    expect((await receiptTimes.POST(send("POST", { owner: READER }), at(list))).status).toBe(409);
    await doneReading(list);
    expect((await receiptTimes.POST(send("POST", { owner: READER }), at(list))).status).toBe(200);
  });
});

describe("correcting when friends paid", () => {
  const PAYEE = "phone-boards-test-04";

  it("is only for the organiser, and only for people in the paid list", async () => {
    const list = await boardFor(PAYEE);
    const bill = await createSplit(doc({ date: "2026-11-01" }));
    await claimSplits(PAYEE, [bill]);
    await setPayment(bill.id, "mint", { kind: "full" }, bill.token);
    const when = Date.now() - 60_000;
    const times = [
      { bill: bill.id, person: "mint", at: when },
      { bill: bill.id, person: "constructor", at: when }, // not a person
    ];
    expect((await paidTimes.PUT(send("PUT", { owner: STRANGER, times }), at(list))).status).toBe(403);
    const r = await (await paidTimes.PUT(send("PUT", { owner: PAYEE, times }), at(list))).json();
    expect(r.changed.map((c: { person: string }) => c.person)).toEqual(["mint"]);
    expect((await getPayments(bill.id)).paidAt).toEqual({ mint: when });
  });
});
