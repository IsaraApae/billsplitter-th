import { describe, expect, it, vi } from "vitest";
import { newDoc } from "@/lib/draft";
import type { SplitDoc } from "@/lib/types";

vi.mock("server-only", () => ({}));

// No Redis settings in tests, so the routes run on the in-memory store.
const { claimSplits, createSplit } = await import("@/lib/server/redis");
const link = await import("../organiser/paakeen/route");
const feed = await import("./[token]/route");

const OWNER = "phone-feed-test-0001";
const OTHER = "phone-feed-test-0002";

// Each request comes from its own address, so the rate limit never gets in a test's way.
let caller = 0;
const from = () => ({ "x-forwarded-for": `10.9.${Math.floor(caller / 250)}.${caller++ % 250}` });
const ask = (body: unknown) =>
  link.POST(new Request("http://test/api/organiser/paakeen", { method: "POST", headers: { "Content-Type": "application/json", ...from() }, body: JSON.stringify(body) }));
const read = (address: string, query = "") => {
  const token = address.split("/api/feed/")[1];
  return feed.GET(new Request(`http://test/api/feed/${token}${query}`, { headers: from() }), { params: Promise.resolve({ token }) });
};

/** A ฿1,000 dinner for two, split equally, saved and claimed by `owner`'s phone. */
async function bill(owner: string, extra: Partial<SplitDoc> = {}) {
  const doc: SplitDoc = {
    ...newDoc(),
    title: "Mookata",
    mode: "equal",
    people: [
      { id: "me", name: "Isara" },
      { id: "mint", name: "Mint" },
    ],
    items: [
      { id: "a", name: "Pork set", qty: 1, price: 60000, assigned: [] },
      { id: "b", name: "Coke", qty: 2, price: 20000, assigned: [] },
    ],
    ...extra,
  };
  const made = await createSplit(doc);
  await claimSplits(owner, [made]);
  return made.id;
}

describe("the ป้าคีน link", () => {
  it("is only made for a phone's own key, and only given out when made", async () => {
    expect((await ask({})).status).toBe(400);
    expect(await (await ask({ owner: OWNER })).json()).toEqual({ connected: false });
    const made = await (await ask({ owner: OWNER, make: true })).json();
    expect(made.connected).toBe(true);
    expect(made.link).toMatch(/^http:\/\/test\/api\/feed\/[\w-]{43}$/);
    expect(await (await ask({ owner: OWNER })).json()).toEqual({ connected: true });
  });

  it("gives the organiser's recent bills with what was paid and their share, and no one else's", async () => {
    const mine = await bill(OWNER);
    await bill(OTHER, { title: "Someone else's" });
    const { link: address } = await (await ask({ owner: OWNER, make: true })).json();
    const r = await read(address);
    expect(r.status).toBe(200);
    const { bills } = await r.json();
    expect(bills.map((b: { title: string }) => b.title)).toEqual(["Mookata"]);
    expect(bills[0]).toMatchObject({ id: mine, total: 100000, paid: 100000, mine: 50000, people: 2, items: ["Pork set", "Coke"] });
    expect(JSON.stringify(bills)).not.toMatch(/Mint|Isara/);  // nothing about who the friends are
  });

  it("takes off what friends paid at the shop themselves", async () => {
    await bill(OWNER, { title: "Drinks paid by Mint", prepaid: [{ personId: "mint", amount: 30000 }] });
    const { link: address } = await (await ask({ owner: OWNER, make: true })).json();
    const { bills } = await (await read(address)).json();
    expect(bills.find((b: { title: string }) => b.title === "Drinks paid by Mint")).toMatchObject({ total: 100000, paid: 70000 });
  });

  it("leaves out bills from before `since`", async () => {
    const { link: address } = await (await ask({ owner: OWNER, make: true })).json();
    const { bills } = await (await read(address, `?since=${Date.now() + 60_000}`)).json();
    expect(bills).toEqual([]);
  });

  it("stops working once a new one is made, or it is ended", async () => {
    const { link: first } = await (await ask({ owner: OWNER, make: true })).json();
    const { link: second } = await (await ask({ owner: OWNER, make: true })).json();
    expect((await read(first)).status).toBe(404);
    expect((await read(second)).status).toBe(200);
    expect(await (await ask({ owner: OWNER, drop: true })).json()).toEqual({ connected: false });
    expect((await read(second)).status).toBe(404);
    expect((await read("x/api/feed/not-a-token")).status).toBe(404);
  });
});
