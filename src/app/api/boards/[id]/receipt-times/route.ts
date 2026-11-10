import { billDay } from "@/lib/draft";
import { ownerBody } from "@/lib/server/board";
import { jsonError, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { readReceiptTime } from "@/lib/server/receiptTime";
import { boardBills, doneReading, isValidId, keepReceiptTime, receiptTimeOf, startReading } from "@/lib/server/redis";

export const maxDuration = 60;

/** Receipts read at once. */
const AT_ONCE = 3;
/**
 * So the answer comes back inside maxDuration: every read is told how long it has until
 * DEADLINE_MS, and none starts with less than LEAST_MS left. What isn't reached is read on
 * the next press (what was read is kept, so each press carries on from the last).
 */
const DEADLINE_MS = 50_000;
const LEAST_MS = 8_000;

/**
 * For the organiser: the time printed on the receipt of each of their bills that was shared
 * before the server kept share times and still has its receipt photo.
 * { owner, bills?: [billId] } → { times: { billId: ISO }, unread: [billId], later: [billId] }
 * (`bills`: only these; `unread`: no photo, or no usable time on it; `later`: not read this
 * time, ask again). Nothing is saved to the list: the sheet fills its "Counts from" fields
 * and the organiser saves them. A photo is read once: its time is kept with the bill.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/boards/[id]/receipt-times">) {
  const limited = await rateLimit(req, "scan");
  if (limited) return limited;
  const { id } = await ctx.params;
  return safely(async () => {
    const o = await ownerBody<{ bills?: unknown }>(req, id, 8_000);
    if (!o.ok) return o.res;
    const asked = o.body.bills;
    if (asked !== undefined && (!Array.isArray(asked) || asked.length > 300 || !asked.every((x) => typeof x === "string" && isValidId(x)))) {
      return jsonError(400, "bad_request", "Invalid list.");
    }
    if (!(await startReading(id))) return jsonError(409, "busy", "Your receipts are already being read. Try again in a minute.");
    try {
      const started = Date.now();
      const bills = ((await boardBills(id)) ?? []).filter((b) => !b.sharedAt && (!asked || asked.includes(b.id)));
      const kept = await Promise.all(bills.map((b) => (b.doc.photo ? receiptTimeOf(b.id, b.doc.photo) : null)));
      const times: Record<string, string> = {};
      const unread: string[] = [];
      const later: string[] = [];
      const toRead = bills.filter((b, k) => {
        if (kept[k] === undefined) return true;
        if (kept[k]) times[b.id] = kept[k]!;
        else unread.push(b.id);
        return false;
      });
      for (let i = 0; i < toRead.length; i += AT_ONCE) {
        const left = DEADLINE_MS - (Date.now() - started);
        if (left < LEAST_MS) {
          later.push(...toRead.slice(i).map((b) => b.id));
          break;
        }
        const batch = toRead.slice(i, i + AT_ONCE);
        const read = await Promise.all(batch.map((b) => readReceiptTime(b.doc.photo!, billDay(b.doc), left).catch(() => undefined)));
        await Promise.all(
          batch.map(async (b, k) => {
            const t = read[k];
            if (t === undefined) return void later.push(b.id);
            if (t) times[b.id] = t;
            else unread.push(b.id);
            await keepReceiptTime(b.id, b.doc.photo!, t).catch(() => {});
          }),
        );
      }
      return Response.json({ times, unread, later }, { headers: { "Cache-Control": "no-store" } });
    } finally {
      await doneReading(id).catch(() => {});
    }
  });
}
