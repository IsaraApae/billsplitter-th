import { fastestRanking } from "@/lib/server/board";
import { jsonError, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { isValidId } from "@/lib/server/redis";

/**
 * The Who pays fastest ranking as data, fastest first (what /o/{id}/fastest shows anyone
 * with the link): { times: [{ key, name, avgMs, paid, unpaid }] }. Used for a friend's
 * place and average when their splits are listed in History.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/boards/[id]/fastest">) {
  const limited = await rateLimit(req, "read");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "List not found.");
  return safely(async () => {
    const r = await fastestRanking(id);
    if (!r) return jsonError(404, "not_found", "List not found.");
    return Response.json(
      { times: r.times.map((p) => ({ key: p.key, name: p.look.name, avgMs: p.avgMs, paid: p.paid, unpaid: p.unpaid })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
