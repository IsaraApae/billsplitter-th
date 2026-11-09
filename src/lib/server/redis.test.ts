import { afterEach, describe, expect, it, vi } from "vitest";
import { newDoc } from "../draft";
import type { SplitDoc } from "../types";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

// No Redis settings in tests, so this runs on the in-memory store.
const { addCheckedPayment, addSlip, boardBills, boardFor, boardOfSplit, boardHidden, boardSkipped, boardStarts, claimSplits, createEvent, createSplit, getPayments, ownsBoard, setBoardHidden, setBoardSkipped, setBoardStarts, setEventPayment, setPaidTimes, setPayment, getPaidState, getSlips, otherSplitsWith, photoInUse, updateSplit } = await import("./redis");

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

const slip = (reference: string, amount: number, at: string) => ({
  photo: "dev:s-0123456789abcdef",
  amount,
  date: "2026-11-08",
  reference,
  receiver: "unknown" as const,
  senderName: null,
  at,
});

describe("slips paying the same person at once", () => {
  it("both count, and the second one gives the big tick", async () => {
    const { id } = await createSplit(doc());
    const [a, b] = await Promise.all([addCheckedPayment(id, "mint", 20000, 50000), addCheckedPayment(id, "mint", 30000, 50000)]);
    expect([a, b].map((r) => r !== "not_found" && r.paidSoFar).sort()).toEqual([20000, 50000].sort());
    const state = await getPaidState(id, doc());
    expect(state.paid).toEqual(["mint"]);
    expect(state.partial).toEqual({});
  });

  it("keeps every slip sent at the same time, oldest first", async () => {
    const { id } = await createSplit(doc());
    await Promise.all([addSlip(id, "mint", slip("REF1", 20000, "2026-11-08T10:00:00Z")), addSlip(id, "mint", slip("REF2", 30000, "2026-11-08T09:00:00Z"))]);
    const slips = await getSlips(id);
    expect(slips.mint.map((s) => s.reference)).toEqual(["REF2", "REF1"]);
  });

  it("says not_found for someone who isn't in the split", async () => {
    const { id } = await createSplit(doc());
    expect(await addCheckedPayment(id, "nobody", 100, 100)).toBe("not_found");
  });
});

describe("the organiser's other bills, for What I owe", () => {
  it("only answer for someone in the bill asked about, and only bills they still owe on", async () => {
    const people = [
      { id: "me", name: "Isara" },
      { id: "mint", name: "Mint" },
    ];
    const held = await createSplit(doc({ people }));
    const owed = await createSplit(doc({ title: "Karaoke", people: [{ id: "me", name: "Isara" }, { id: "x9", name: "mint " }] }));
    const paid = await createSplit(doc({ title: "Coffee", people }));
    const notMint = await createSplit(doc({ title: "Lunch", people: [{ id: "me", name: "Isara" }, { id: "ploy", name: "Ploy" }] }));
    await claimSplits("phone1", [held, owed, paid, notMint]);
    await addCheckedPayment(paid.id, "mint", 50000, 50000);

    expect((await otherSplitsWith(held.id, "mint")).map((s) => s.doc.title)).toEqual(["Karaoke"]);
    // Ploy isn't in the bill held, so nothing about her comes back.
    expect(await otherSplitsWith(held.id, "ploy")).toEqual([]);
  });
});

describe("photos shared by two splits", () => {
  it("stay in use while either split shows them", async () => {
    const photo = "dev:r-00112233445566ff";
    const first = await createSplit(doc({ photo }));
    const copy = await createSplit(doc({ photo }));
    // The copy drops the photo: the first split still shows it.
    await updateSplit(copy.id, copy.token, doc());
    expect(await photoInUse(photo)).toBe(true);
    await updateSplit(first.id, first.token, doc());
    expect(await photoInUse(photo)).toBe(false);
  });
});

describe("hiding people from who pays fastest", () => {
  it("only the phone the list belongs to owns it, and what it hides is kept", async () => {
    const owner = "phone-owner-key-0001";
    const id = await boardFor(owner);
    expect(await ownsBoard(id, owner)).toBe(true);
    expect(await ownsBoard(id, "someone-else-key-01")).toBe(false);
    expect(await ownsBoard("AAAAAAAAAAAAAAAA", owner)).toBe(false);
    await setBoardHidden(id, [{ key: "boss01", name: "บอส" }]);
    expect(await boardHidden(id)).toEqual([{ key: "boss01", name: "บอส" }]);
    await setBoardHidden(id, []);
    expect(await boardHidden(id)).toEqual([]);
    await setBoardSkipped(id, ["AbCdEfGhIjKlMnOp"]);
    expect(await boardSkipped(id)).toEqual(["AbCdEfGhIjKlMnOp"]);
    await setBoardSkipped(id, []);
    expect(await boardSkipped(id)).toEqual([]);
    await setBoardStarts(id, { AbCdEfGhIjKlMnOp: "2026-10-29T04:34:00.000Z" });
    expect(await boardStarts(id)).toEqual({ AbCdEfGhIjKlMnOp: "2026-10-29T04:34:00.000Z" });
    await setBoardStarts(id, {});
    expect(await boardStarts(id)).toEqual({});
  });
});

describe("paid times keep the first tick", () => {
  afterEach(() => vi.restoreAllMocks());
  const at = (t: number) => vi.spyOn(Date, "now").mockReturnValue(t);
  const T1 = Date.parse("2026-11-01T10:00:00Z");
  const T2 = Date.parse("2026-11-05T10:00:00Z");
  const T3 = Date.parse("2026-11-07T10:00:00Z");

  it("ticking someone paid again doesn't move their time later", async () => {
    const { id, token } = await createSplit(doc());
    at(T1);
    await setPayment(id, "mint", { kind: "full" }, token);
    at(T2);
    await setPayment(id, "mint", { kind: "full" }, token);
    expect((await getPayments(id)).paidAt).toEqual({ mint: T1 });
  });

  it("unticked and ticked again, the new tick's time counts", async () => {
    const { id, token } = await createSplit(doc());
    at(T1);
    await setPayment(id, "mint", { kind: "full" }, token);
    await setPayment(id, "mint", { kind: "none" }, token);
    at(T2);
    await setPayment(id, "mint", { kind: "full" }, token);
    expect((await getPayments(id)).paidAt).toEqual({ mint: T2 });
  });

  it("a big bill's later payment keeps the time of the bill it already paid", async () => {
    const a = await createSplit(doc({ title: "Food" }));
    const b = await createSplit(doc({ title: "Karaoke" }));
    const ev = await createEvent({ title: "Night out", date: "2026-11-01" }, [a, b]);
    if (ev === "forbidden" || ev === "mixed_currency") throw new Error(ev);
    at(T1);
    // Mint's share is 500.00 on each bill: 500.00 pays the first in full.
    await setEventPayment(ev.id, ev.token, "mint", { kind: "part", amount: 50000 });
    at(T3);
    await setEventPayment(ev.id, ev.token, "mint", { kind: "full" });
    const [pa, pb] = await Promise.all([getPayments(a.id), getPayments(b.id)]);
    expect([pa.paidAt?.mint, pb.paidAt?.mint]).toEqual([T1, T3]);
  });
});

describe("a bill's link to its organiser's list", () => {
  it("is their list once they've made one, and nothing before that", async () => {
    const owner = "phone-bill-board-0001";
    const bill = await createSplit(doc());
    expect(await boardOfSplit(bill.id)).toBeNull(); // nobody owns it yet
    await claimSplits(owner, [bill]);
    expect(await boardOfSplit(bill.id)).toBeNull(); // no list made yet
    const list = await boardFor(owner);
    expect(await boardOfSplit(bill.id)).toBe(list);
  });
});

describe("correcting when people paid", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sets the time for people ticked paid on the organiser's own bills, and says what it replaced", async () => {
    const owner = "phone-paid-times-0001";
    const list = await boardFor(owner);
    const mine = await createSplit(doc({ date: "2026-11-01" }));
    const other = await createSplit(doc({ date: "2026-11-01" }));
    await claimSplits(owner, [mine]);
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-03T10:00:00Z"));
    await setPayment(mine.id, "mint", { kind: "full" }, mine.token);
    await setPayment(other.id, "mint", { kind: "full" }, other.token);
    const bank = Date.parse("2026-11-01T13:12:00+07:00");
    const changed = await setPaidTimes(list, [
      { bill: mine.id, person: "mint", at: bank },
      { bill: mine.id, person: "nobody", at: bank }, // not ticked paid
      { bill: other.id, person: "mint", at: bank }, // not on this list
      { bill: mine.id, person: "mint", at: Date.parse("2026-10-20T12:00:00+07:00") }, // long before the bill
    ]);
    expect(changed).toEqual([{ bill: mine.id, person: "mint", at: bank, was: Date.parse("2026-11-03T10:00:00Z") }]);
    expect((await getPayments(mine.id)).paidAt).toEqual({ mint: bank });
    expect((await getPayments(other.id)).paidAt).toEqual({ mint: Date.parse("2026-11-03T10:00:00Z") });
    expect(await setPaidTimes("AAAAAAAAAAAAAAAA", [{ bill: mine.id, person: "mint", at: bank }])).toEqual([]);
  });
});

describe("when a bill was shared", () => {
  afterEach(() => vi.useRealTimers());

  it("is kept when the bill is made, carried to the organiser's bills, and kept through edits", async () => {
    const shared = Date.parse("2026-10-29T04:34:00Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(shared);
    const { id, token } = await createSplit(doc({ date: "2026-10-29", createdAt: "2026-10-27T14:48:00.000Z" }));
    vi.setSystemTime(shared + 86_400_000);
    await updateSplit(id, token, doc({ title: "Edited", date: "2026-10-29" }));
    await claimSplits("phone-share-key-00001", [{ id, token }]);
    const board = await boardFor("phone-share-key-00001");
    const bills = await boardBills(board);
    expect(bills?.find((b) => b.id === id)?.sharedAt).toBe(new Date(shared).toISOString());
  });
});
