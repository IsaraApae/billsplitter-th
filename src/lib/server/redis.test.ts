import { describe, expect, it, vi } from "vitest";
import { newDoc } from "../draft";
import type { SplitDoc } from "../types";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

// No Redis settings in tests, so this runs on the in-memory store.
const { addCheckedPayment, addSlip, createSplit, getPaidState, getSlips, photoInUse, updateSplit } = await import("./redis");

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
