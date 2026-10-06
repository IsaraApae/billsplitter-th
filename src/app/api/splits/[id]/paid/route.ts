import { jsonError, readJson, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { paymentFrom } from "@/lib/server/payment";
import { getPaidState, getSplit, isValidId, setPayment } from "@/lib/server/redis";

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request, ctx: RouteContext<"/api/splits/[id]/paid">) {
  const limited = await rateLimit(req, "read");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Split not found.");
  return safely(async () => {
    const s = await getSplit(id);
    if (!s) return jsonError(404, "not_found", "This split doesn't exist or has expired.");
    const state = await getPaidState(id, s.doc);
    return Response.json({ ...state, people: s.doc.people.length, updatedAt: s.updatedAt }, { headers: noStore });
  });
}

/**
 * Body: { personId, paid: true } (paid in full), { personId, paid: false }
 * (not paid), or { personId, amount } (paid part of it, minor units).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/splits/[id]/paid">) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Split not found.");
  return safely(async () => {
    const body = (await readJson(req, 2_000)) as { personId?: unknown; paid?: unknown; amount?: unknown } | undefined;
    const payment = paymentFrom(body);
    if (!body || typeof body.personId !== "string" || body.personId.length > 40 || !payment) {
      return jsonError(400, "bad_request", "Invalid request.");
    }
    const token = req.headers.get("x-edit-token");
    const r = await setPayment(id, body.personId, payment, token && token.length <= 100 ? token : null);
    if (r === "not_found") return jsonError(404, "not_found", "Split or person not found.");
    if (r === "forbidden") return jsonError(403, "forbidden", "Only the organiser can change who has paid.");
    return Response.json(r, { headers: noStore });
  });
}
