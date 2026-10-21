import { jsonError, readJson, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { boardFor, isOrganiserKey } from "@/lib/server/redis";

/** The organiser's "who still owes" list link: { owner } → { id } (the same one each time). */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  return safely(async () => {
    const body = (await readJson(req, 2_000)) as { owner?: unknown } | undefined;
    if (typeof body?.owner !== "string" || !isOrganiserKey(body.owner)) return jsonError(400, "bad_request", "Invalid request.");
    return Response.json({ id: await boardFor(body.owner) });
  });
}
