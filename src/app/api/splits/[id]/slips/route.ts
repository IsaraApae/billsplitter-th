import { jsonError, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { canEditSplit, getSlips, isValidId } from "@/lib/server/redis";

/** The slips friends uploaded — organiser only (they show bank names). */
export async function GET(req: Request, ctx: RouteContext<"/api/splits/[id]/slips">) {
  const limited = await rateLimit(req, "read");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Split not found.");
  return safely(async () => {
    const token = req.headers.get("x-edit-token");
    if (!(await canEditSplit(id, token && token.length <= 100 ? token : null))) {
      return jsonError(403, "forbidden", "Only the organiser can see slips.");
    }
    return Response.json({ slips: await getSlips(id) }, { headers: { "Cache-Control": "no-store" } });
  });
}
