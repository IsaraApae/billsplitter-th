import { afterEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
const { claimMySplits, claimSplit } = await import("./claim");

/** Bills a, b, c in History, each with an edit token; returns the ids each claim sent. */
function setup() {
  store.clear();
  store.set("bs:history", JSON.stringify(["a", "b", "c"].map((id) => ({ id, title: id, createdAt: "2026-11-01", total: 0, currency: "THB", people: 1, paid: 0 }))));
  store.set("bs:tokens", JSON.stringify({ a: "ta", b: "tb", c: "tc" }));
  const sent: string[][] = [];
  vi.stubGlobal("fetch", async (_: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)).splits.map((s: { id: string }) => s.id));
    return new Response("{}");
  });
  return sent;
}

describe("claimMySplits", () => {
  afterEach(() => vi.useRealTimers());

  it("sends every bill when due, then only new ones when forced, and nothing otherwise", async () => {
    const sent = setup();
    await claimMySplits();
    await claimMySplits(true);
    await claimMySplits();
    expect(sent).toEqual([["a", "b", "c"]]);
    await claimSplit("d", "td");
    store.set("bs:history", JSON.stringify([...JSON.parse(store.get("bs:history")!), { id: "d" }, { id: "e" }]));
    store.set("bs:tokens", JSON.stringify({ ...JSON.parse(store.get("bs:tokens")!), d: "td", e: "te" }));
    await claimMySplits(true);
    expect(sent.slice(1)).toEqual([["d"], ["e"]]);
  });

  it("sends them all again after 12 hours", async () => {
    const sent = setup();
    vi.useFakeTimers({ now: Date.parse("2026-11-08T00:00:00Z") });
    await claimMySplits();
    vi.setSystemTime(Date.parse("2026-11-08T13:00:00Z"));
    await claimMySplits(true);
    expect(sent).toEqual([["a", "b", "c"], ["a", "b", "c"]]);
  });
});
