import { jsonError, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { unpaidPeople } from "@/lib/owed";
import { isValidId, sameOrganiserBills } from "@/lib/server/redis";

/**
 * Everyone who still owes something across the bills by the organiser of
 * split `id` (A–Z, names and avatars only), for "Who are you?" in What I owe.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/splits/[id]/people">) {
  const limited = await rateLimit(req, "read");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Split not found.");
  return safely(async () => {
    const bills = await sameOrganiserBills(id);
    const people = unpaidPeople(bills.map((b) => ({ ...b, href: `/s/${b.id}` })));
    return Response.json({ people }, { headers: { "Cache-Control": "no-store" } });
  });
}
