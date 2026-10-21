import { jsonError, readJson, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { claimSplits, isOrganiserKey, isValidId } from "@/lib/server/redis";

/**
 * The organiser's phone says which splits it made: { owner, splits: [{ id,
 * token }] } (each proven with its edit token). Lets "What I owe" on a
 * friend's phone find the organiser's other bills with that friend in them.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  return safely(async () => {
    const body = (await readJson(req, 60_000)) as { owner?: unknown; splits?: unknown } | undefined;
    const splits = Array.isArray(body?.splits) ? body.splits : null;
    if (typeof body?.owner !== "string" || !isOrganiserKey(body.owner) || !splits || splits.length > 200) {
      return jsonError(400, "bad_request", "Invalid request.");
    }
    const valid = splits.filter(
      (s): s is { id: string; token: string } =>
        !!s && typeof s.id === "string" && isValidId(s.id) && typeof s.token === "string" && s.token.length <= 100,
    );
    return Response.json({ claimed: await claimSplits(body.owner, valid) });
  });
}
