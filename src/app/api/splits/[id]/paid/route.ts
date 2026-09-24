import { jsonError, readJson, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { getPaid, getSplit, isValidId, setPaid } from "@/lib/server/redis";

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request, ctx: RouteContext<"/api/splits/[id]/paid">) {
  const limited = await rateLimit(req, "read");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Split not found.");
  return safely(async () => {
    const [s, paid] = await Promise.all([getSplit(id), getPaid(id)]);
    if (!s) return jsonError(404, "not_found", "This split doesn't exist or has expired.");
    const ids = new Set(s.doc.people.map((p) => p.id));
    return Response.json(
      { paid: paid.filter((p) => ids.has(p)), people: s.doc.people.length, updatedAt: s.updatedAt },
      { headers: noStore },
    );
  });
}

export async function POST(req: Request, ctx: RouteContext<"/api/splits/[id]/paid">) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Split not found.");
  return safely(async () => {
    const body = (await readJson(req, 2_000)) as { personId?: unknown; paid?: unknown } | undefined;
    if (!body || typeof body.personId !== "string" || typeof body.paid !== "boolean" || body.personId.length > 40) {
      return jsonError(400, "bad_request", "Invalid request.");
    }
    const paid = await setPaid(id, body.personId, body.paid);
    if (!paid) return jsonError(404, "not_found", "Split or person not found.");
    return Response.json({ paid }, { headers: noStore });
  });
}
