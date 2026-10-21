import { jsonError, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { isValidId, otherSplitsWith } from "@/lib/server/redis";

/**
 * The organiser's other splits that include this person: ?person=<id>&name=<name>
 * (the person as they are in split `id`). For "What I owe" on a friend's phone.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/splits/[id]/others">) {
  const limited = await rateLimit(req, "read");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Split not found.");
  const url = new URL(req.url);
  const person = url.searchParams.get("person") ?? "";
  const name = (url.searchParams.get("name") ?? "").slice(0, 80);
  if (!/^[\w-]{1,40}$/.test(person) || person === "me" || !name.trim()) return jsonError(400, "bad_request", "Invalid request.");
  return safely(async () =>
    Response.json({ splits: await otherSplitsWith(id, { id: person, name }) }, { headers: { "Cache-Control": "no-store" } }),
  );
}
