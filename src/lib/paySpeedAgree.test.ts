import { describe, expect, it } from "vitest";
import { needsPayTimes, paidToMe } from "./client/historyRefresh";
import { historyFromDoc, type HistoryEntry } from "./client/storage";
import { newDoc } from "./draft";
import { boardSpeed, paySpeed } from "./owed";
import { paymentSummary } from "./settle";
import type { SplitDoc } from "./types";

// "Who pays fastest" is shown twice: on "Owed to you" from this phone's History, and on
// the shared list from the bills on the server. Built from the same bills, they must agree.

const now = Date.parse("2026-11-08T12:00:00+07:00");
const noon = (day: string) => Date.parse(`${day}T12:00:00+07:00`);
const me = { id: "me", name: "Isara" };
const mint = { id: "mint01", name: "Mint" };
const ploy = { id: "ploy01", name: "Ploy" };
const boss = { id: "boss01", name: "บอส" };

type Bill = { id: string; doc: SplitDoc; paid: string[]; partial: Record<string, number>; paidAt: Record<string, number> };

function bill(id: string, date: string, people: SplitDoc["people"], paidAt: Record<string, number>): Bill {
  const doc: SplitDoc = {
    ...newDoc(),
    title: id,
    date,
    mode: "equal",
    people,
    items: [{ id: "i", name: "x", qty: 1, price: 30000 * people.length, assigned: [] }],
  };
  return { id, doc, paid: Object.keys(paidAt), partial: {}, paidAt };
}

/** The History entry "Owed to you" has for a bill once it's been refreshed (as refreshEntry builds it). */
function historyOf(b: Bill): HistoryEntry {
  const summary = paymentSummary(b.doc, b);
  return { id: b.id, title: b.doc.title, currency: b.doc.currency, ...historyFromDoc(b.doc), ...summary, paidAt: paidToMe(b.paidAt, summary.paidIds) };
}

const ranking = (speed: ReturnType<typeof paySpeed>) => speed.map((p) => `${p.look.name} ${p.days.toFixed(2)} ${p.paid}/${p.unpaid}`);

const bills = [
  // Mint and Ploy each pay one bill two days after it: a tie.
  bill("dinner", "2026-11-01", [me, mint, ploy, boss], { mint01: noon("2026-11-03") }),
  bill("karaoke", "2026-11-02", [me, ploy, boss], { ploy01: noon("2026-11-04") }),
  bill("lunch", "2026-11-05", [me, { id: "x9", name: "mint " }, boss], {}),
];

describe("who pays fastest agrees between Owed to you and the shared list", () => {
  it("ranks the same, whatever order the bills come in (ties included)", () => {
    const fromHistory = ranking(paySpeed(bills.map(historyOf), now));
    for (const order of [[0, 1, 2], [2, 1, 0], [1, 2, 0], [2, 0, 1]]) {
      const shuffled = order.map((i) => bills[i]);
      expect(ranking(boardSpeed(shuffled, now))).toEqual(fromHistory);
      expect(ranking(paySpeed(shuffled.map(historyOf), now))).toEqual(fromHistory);
    }
  });

  it("breaks a tie by name, A–Z", () => {
    // Each pays one bill two days after it.
    const a = bill("a", "2026-11-01", [me, ploy], { ploy01: noon("2026-11-03") });
    const b = bill("b", "2026-11-04", [me, mint], { mint01: noon("2026-11-06") });
    for (const order of [[a, b], [b, a]]) {
      expect(boardSpeed(order, now).map((p) => p.look.name)).toEqual(["Mint", "Ploy"]);
      expect(paySpeed(order.map(historyOf), now).map((p) => p.look.name)).toEqual(["Mint", "Ploy"]);
    }
  });
});

describe("payment times in History", () => {
  it("are fetched again when someone was ticked on the bill page after the last refresh", () => {
    const h = historyOf(bills[0]);
    expect(needsPayTimes(h)).toBe(false);
    // Ploy ticked on the bill page: History gets the tick, not its time.
    expect(needsPayTimes({ ...h, paidIds: [...(h.paidIds ?? []), "ploy01"] })).toBe(true);
    expect(needsPayTimes({ ...h, paidAt: undefined })).toBe(true);
  });

  it("aren't fetched over and over for ticks the server has no time for", () => {
    const old = { ...bills[0], paidAt: {} }; // ticked before times were kept
    const h = historyOf(old);
    expect(h.paidIds).toEqual(["mint01"]);
    expect(needsPayTimes({ ...h, paidAt: paidToMe(old.paidAt, h.paidIds) })).toBe(false);
  });
});
