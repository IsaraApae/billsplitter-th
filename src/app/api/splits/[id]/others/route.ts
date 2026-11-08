import { jsonError, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { isValidId, otherSplitsWith } from "@/lib/server/redis";

/**
 * The organiser's other splits where this person still owes something: ?person=<id>
 * (the person as they are in split `id`; they're matched in the other splits by that
 * id or by the name split `id` gives them). For "What I owe" on a friend's phone.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/splits/[id]/others">) {
  const limited = await rateLimit(req, "read");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Split not found.");
  const url = new URL(req.url);
  const person = url.searchParams.get("person") ?? "";
  if (!/^[\w-]{1,40}$/.test(person) || person === "me") return jsonError(400, "bad_request", "Invalid request.");
  return safely(async () =>
    Response.json({ splits: await otherSplitsWith(id, person) }, { headers: { "Cache-Control": "no-store" } }),
  );
}
