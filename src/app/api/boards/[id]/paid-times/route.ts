import { ownerBody } from "@/lib/server/board";
import { jsonError, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { isValidId, setPaidTimes, type PaidTimeFix } from "@/lib/server/redis";

/**
 * For the organiser: says when friends really paid, e.g. from the times on their bank statement.
 * { owner, times: [{ bill, person, at: ms | null }] } → { changed: [{ bill, person, at, was }] }.
 * Kept with the list and counted over the tick and any slip; `at: null` goes back to those.
 * Only bills on this list and people already ticked paid change; `was` lets it be undone.
 */
export async function PUT(req: Request, ctx: RouteContext<"/api/boards/[id]/paid-times">) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  const { id } = await ctx.params;
  return safely(async () => {
    const o = await ownerBody<{ times?: unknown }>(req, id, 40_000);
    if (!o.ok) return o.res;
    const raw = o.body.times;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 300) return jsonError(400, "bad_request", "Invalid times.");
    const times: PaidTimeFix[] = [];
    for (const t of raw) {
      if (!t || typeof t.bill !== "string" || !isValidId(t.bill) || typeof t.person !== "string" || !t.person || t.person.length > 100) {
        return jsonError(400, "bad_request", "Invalid times.");
      }
      if (t.at !== null && (typeof t.at !== "number" || !Number.isFinite(t.at))) return jsonError(400, "bad_request", "Invalid times.");
      times.push({ bill: t.bill, person: t.person, at: t.at === null ? null : Math.round(t.at) });
    }
    const changed = await setPaidTimes(id, times);
    return Response.json({ changed }, { headers: { "Cache-Control": "no-store" } });
  });
}
