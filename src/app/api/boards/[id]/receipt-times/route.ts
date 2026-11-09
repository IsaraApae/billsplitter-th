import { billDay } from "@/lib/draft";
import { jsonError, readJson, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { readReceiptTime } from "@/lib/server/receiptTime";
import { boardBills, isOrganiserKey, isValidId, ownsBoard } from "@/lib/server/redis";

export const maxDuration = 60;

/** Receipts read at once, and when to stop starting new ones so the answer comes back in time. */
const AT_ONCE = 3;
const BUDGET_MS = 45_000;

/**
 * For the organiser: the time printed on the receipt of each of their bills that was shared
 * before the server kept share times and still has its receipt photo. { owner } →
 * { times: { billId: ISO }, unread: [billId] }. Nothing is saved: the sheet fills its
 * "Counts from" fields and the organiser saves them.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/boards/[id]/receipt-times">) {
  const limited = await rateLimit(req, "scan");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "List not found.");
  return safely(async () => {
    const body = (await readJson(req, 2_000)) as { owner?: unknown } | undefined;
    if (typeof body?.owner !== "string" || !isOrganiserKey(body.owner)) return jsonError(400, "bad_request", "Invalid request.");
    if (!(await ownsBoard(id, body.owner))) return jsonError(403, "forbidden", "Only the organiser can do this.");
    const bills = ((await boardBills(id)) ?? []).filter((b) => !b.sharedAt);
    const withPhoto = bills.filter((b) => b.doc.photo);
    const times: Record<string, string> = {};
    const started = Date.now();
    for (let i = 0; i < withPhoto.length && Date.now() - started < BUDGET_MS; i += AT_ONCE) {
      const batch = withPhoto.slice(i, i + AT_ONCE);
      const read = await Promise.all(batch.map((b) => readReceiptTime(b.doc.photo!, billDay(b.doc)).catch(() => null)));
      batch.forEach((b, k) => {
        if (read[k]) times[b.id] = read[k]!;
      });
    }
    const unread = bills.filter((b) => !times[b.id]).map((b) => b.id);
    return Response.json({ times, unread }, { headers: { "Cache-Control": "no-store" } });
  });
}
