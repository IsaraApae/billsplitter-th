import { jsonError, readJson, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { isOrganiserKey, isValidId, ownsBoard, setPaidTimes, type PaidTimeFix } from "@/lib/server/redis";

/**
 * For the organiser: corrects when friends paid, e.g. from the times on their bank statement.
 * { owner, times: [{ bill, person, at: ms }] } → { changed: [{ bill, person, at, was }] }.
 * Only bills on this list and people already ticked paid change; `was` lets it be undone.
 */
export async function PUT(req: Request, ctx: RouteContext<"/api/boards/[id]/paid-times">) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "List not found.");
  return safely(async () => {
    const body = (await readJson(req, 40_000)) as { owner?: unknown; times?: unknown } | undefined;
    if (typeof body?.owner !== "string" || !isOrganiserKey(body.owner)) return jsonError(400, "bad_request", "Invalid request.");
    if (!(await ownsBoard(id, body.owner))) return jsonError(403, "forbidden", "Only the organiser can change this.");
    const raw = body.times;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 300) return jsonError(400, "bad_request", "Invalid times.");
    const times: PaidTimeFix[] = [];
    for (const t of raw) {
      if (!t || typeof t.bill !== "string" || !isValidId(t.bill) || typeof t.person !== "string" || !t.person || t.person.length > 40) {
        return jsonError(400, "bad_request", "Invalid times.");
      }
      if (typeof t.at !== "number" || !Number.isFinite(t.at)) return jsonError(400, "bad_request", "Invalid times.");
      times.push({ bill: t.bill, person: t.person, at: Math.round(t.at) });
    }
    const changed = await setPaidTimes(id, times);
    return Response.json({ changed }, { headers: { "Cache-Control": "no-store" } });
  });
}
