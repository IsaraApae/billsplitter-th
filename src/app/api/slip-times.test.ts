import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newDoc } from "@/lib/draft";
import type { SlipRead } from "@/lib/slip";
import type { SplitDoc } from "@/lib/types";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
// Gemini is stood in for: these tests are about what's kept and when, not about reading pictures.
const reader = vi.hoisted(() => ({
  slip: null as SlipRead | null,
  readSlipTime: vi.fn<(photo: string, date: string, budgetMs?: number) => Promise<string | null | undefined>>(),
}));
vi.mock("@/lib/server/slipRead", () => ({
  readSlipForm: async (req: Request, field: string) => {
    const form = await req.formData();
    return { ok: true, bytes: Buffer.from("slip"), mime: "image/jpeg", personRef: String(form.get(field) ?? "") };
  },
  readSlip: async () => ({ ok: true, slip: reader.slip }),
  readSlipTime: reader.readSlipTime,
}));

// No Redis settings in tests, so the routes run on the in-memory store.
const { addSlip, boardBills, boardFor, claimSplits, createSplit, getPaidState, getSlips, setPayment } = await import("@/lib/server/redis");
const { payTimes } = await import("@/lib/owed");
const slipRoute = await import("./splits/[id]/slip/route");
const slipTimes = await import("./boards/[id]/slip-times/route");

const doc = (extra: Partial<SplitDoc> = {}): SplitDoc => ({
  ...newDoc(),
  title: "Dinner",
  date: "2026-11-08",
  mode: "equal",
  people: [
    { id: "me", name: "Isara" },
    { id: "mint", name: "Mint" },
  ],
  items: [{ id: "i", name: "x", qty: 1, price: 100000, assigned: [] }], // Mint owes ฿500
  ...extra,
});

const read = (over: Partial<SlipRead> = {}): SlipRead => ({
  isSlip: true,
  amount: 500,
  date: "2026-11-08",
  time: "13:05",
  reference: "SLIPREF000001",
  senderName: "Mint",
  receiverName: "Isara",
  receiverAccount: null,
  bank: "KBank",
  ...over,
});

let caller = 0;
const ip = () => `10.1.${Math.floor(caller / 250)}.${caller++ % 250}`;
const upload = (id: string, personId: string) => {
  const form = new FormData();
  form.set("personId", personId);
  return slipRoute.POST(new Request(`http://test/api/splits/${id}/slip`, { method: "POST", headers: { "x-forwarded-for": ip() }, body: form }), {
    params: Promise.resolve({ id }),
  });
};
const readTimes = (list: string, owner: string) =>
  slipTimes.POST(
    new Request(`http://test/api/boards/${list}/slip-times`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip() },
      body: JSON.stringify({ owner }),
    }),
    { params: Promise.resolve({ id: list }) },
  );

describe("a slip sent in after the organiser ticked them paid", () => {
  it("is kept for when the money was sent, and Who pays fastest counts from it", async () => {
    const owner = "phone-slip-after-01";
    const list = await boardFor(owner);
    const bill = await createSplit(doc());
    await claimSplits(owner, [bill]);
    await setPayment(bill.id, "mint", { kind: "full" }, bill.token); // ticked now, long after 13:05
    reader.slip = read();

    const r = await upload(bill.id, "mint");
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ result: "recorded", amount: 50000, left: 0, slipped: ["mint"] });
    // Payments as they were; the slip kept with when it was sent.
    expect((await getPaidState(bill.id, doc())).paid).toEqual(["mint"]);
    expect((await getSlips(bill.id)).mint.map((s) => s.paidAt)).toEqual(["2026-11-08T06:05:00.000Z"]);
    const [mint] = payTimes((await boardBills(list))!);
    expect(mint.bills[0]).toMatchObject({ paidAt: Date.parse("2026-11-08T13:05:00+07:00"), source: "slip" });

    // A second one: their slip is already saved.
    reader.slip = read({ reference: "SLIPREF000002" });
    expect((await upload(bill.id, "mint")).status).toBe(409);
  });

  it("isn't kept if it's for a different amount (it may be another bill's)", async () => {
    const bill = await createSplit(doc());
    await setPayment(bill.id, "mint", { kind: "full" }, bill.token);
    reader.slip = read({ amount: 120, reference: "SLIPREF000003" });
    const r = await upload(bill.id, "mint");
    expect(r.status).toBe(422);
    expect((await r.json()).message).toMatch(/another bill/);
    expect(await getSlips(bill.id)).toEqual({});
    // Not used up: it can still pay the bill it's for.
    const other = await createSplit(doc({ items: [{ id: "i", name: "x", qty: 1, price: 24000, assigned: [] }] }));
    expect(await (await upload(other.id, "mint")).json()).toMatchObject({ result: "full" });
  });
});

describe("reading the time on slips kept before it was read", () => {
  const OWNER = "phone-slip-times-02";
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    reader.readSlipTime.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reads each once, only for the organiser, and keeps what it found", async () => {
    const list = await boardFor(OWNER);
    const bill = await createSplit(doc());
    await claimSplits(OWNER, [bill]);
    const old = { photo: "dev:s-00000000000000aa", amount: 50000, date: "2026-11-08", reference: "OLDREF000001", receiver: "unknown" as const, senderName: null, at: "2026-11-08T14:00:00.000Z" };
    await addSlip(bill.id, "mint", old);
    await addSlip(bill.id, "mint", { ...old, photo: "", reference: "OLDREF000002" }); // its picture is gone
    reader.readSlipTime.mockResolvedValue("2026-11-08T06:05:00.000Z");

    expect((await readTimes(list, "someone-else-phone-9")).status).toBe(403);
    expect(reader.readSlipTime).not.toHaveBeenCalled();

    expect(await (await readTimes(list, OWNER)).json()).toEqual({ read: 1, left: 0 });
    expect(reader.readSlipTime).toHaveBeenCalledTimes(1);
    expect((await getSlips(bill.id)).mint.map((s) => [s.reference, s.paidAt])).toEqual([
      ["OLDREF000001", "2026-11-08T06:05:00.000Z"],
      ["OLDREF000002", null],
    ]);
    // Nothing left to read.
    expect(await (await readTimes(list, OWNER)).json()).toEqual({ read: 0, left: 0 });
    expect(reader.readSlipTime).toHaveBeenCalledTimes(1);
  });

  it("asks again for one it couldn't read just now", async () => {
    const owner = "phone-slip-times-03";
    const list = await boardFor(owner);
    const bill = await createSplit(doc());
    await claimSplits(owner, [bill]);
    await addSlip(bill.id, "mint", { photo: "dev:s-00000000000000bb", amount: 50000, date: "2026-11-08", reference: "OLDREF000003", receiver: "unknown", senderName: null, at: "2026-11-08T14:00:00.000Z" });
    reader.readSlipTime.mockResolvedValueOnce(undefined).mockResolvedValueOnce(null);
    expect(await (await readTimes(list, owner)).json()).toEqual({ read: 0, left: 1 });
    expect(await (await readTimes(list, owner)).json()).toEqual({ read: 0, left: 0 }); // read: no time on it
    expect((await getSlips(bill.id)).mint[0].paidAt).toBeNull();
  });
});
