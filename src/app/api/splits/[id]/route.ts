import { parseSplitDoc } from "@/lib/schema";
import { jsonError, readJson, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { getPaidState, getSplit, isValidId, touchOwner, updateSplit } from "@/lib/server/redis";

export async function GET(req: Request, ctx: RouteContext<"/api/splits/[id]">) {
  const limited = await rateLimit(req, "read");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Split not found.");
  return safely(async () => {
    const s = await getSplit(id);
    if (!s) return jsonError(404, "not_found", "This split doesn't exist or has expired.");
    const { paid, partial } = await getPaidState(id, s.doc);
    return Response.json({ doc: s.doc, updatedAt: s.updatedAt, paid, partial }, { headers: { "Cache-Control": "no-store" } });
  });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/splits/[id]">) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  const { id } = await ctx.params;
  const token = req.headers.get("x-edit-token") ?? "";
  if (!isValidId(id)) return jsonError(404, "not_found", "Split not found.");
  if (!/^[\w-]{20,100}$/.test(token)) return jsonError(403, "forbidden", "Only the creator can edit this split.");
  return safely(async () => {
    const body = await readJson(req);
    if (body === undefined) return jsonError(400, "bad_request", "Invalid or too-large request.");
    const parsed = parseSplitDoc(body);
    if (!parsed.ok) return jsonError(422, "invalid", parsed.error);
    const r = await updateSplit(id, token, parsed.doc);
    if (r === "not_found") return jsonError(404, "not_found", "This split doesn't exist or has expired.");
    if (r === "forbidden") return jsonError(403, "forbidden", "Only the creator can edit this split.");
    if (parsed.doc.payment.ownerId) await touchOwner(parsed.doc.payment.ownerId);
    return Response.json({ id });
  });
}
