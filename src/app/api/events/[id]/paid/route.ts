import { jsonError, readJson, safely } from "@/lib/server/http";
import { paymentFrom } from "@/lib/server/payment";
import { rateLimit } from "@/lib/server/ratelimit";
import { isValidId, setEventPayment } from "@/lib/server/redis";

/** Record one person's payment for the whole big bill: { personKey, paid } or { personKey, amount }. */
export async function POST(req: Request, ctx: RouteContext<"/api/events/[id]/paid">) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Big bill not found.");
  return safely(async () => {
    const body = (await readJson(req, 2_000)) as { personKey?: unknown; paid?: unknown; amount?: unknown } | undefined;
    const payment = paymentFrom(body);
    if (!body || typeof body.personKey !== "string" || body.personKey.length > 40 || !payment) {
      return jsonError(400, "bad_request", "Invalid request.");
    }
    const token = req.headers.get("x-edit-token");
    const r = await setEventPayment(id, token && token.length <= 100 ? token : null, body.personKey, payment);
    if (r === "not_found") return jsonError(404, "not_found", "Big bill or person not found.");
    if (r === "forbidden") return jsonError(403, "forbidden", "Only the organiser can change who has paid.");
    return Response.json(r, { headers: { "Cache-Control": "no-store" } });
  });
}
