import { jsonError, readJson, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { dropFeed, hasFeed, isOrganiserKey, makeFeed } from "@/lib/server/redis";

/**
 * The Me page's ป้าคีน link, for the organiser's phone (its key goes in the body as `owner`):
 * { owner } says whether there is one; { owner, make: true } makes a new one (the old one stops)
 * and gives its address, the only time it is ever given; { owner, drop: true } ends it.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  return safely(async () => {
    const body = (await readJson(req, 2_000)) as { owner?: unknown; make?: unknown; drop?: unknown } | undefined;
    if (typeof body?.owner !== "string" || !isOrganiserKey(body.owner)) return jsonError(400, "bad_request", "Invalid request.");
    const headers = { "Cache-Control": "no-store" };
    if (body.drop === true) {
      await dropFeed(body.owner);
      return Response.json({ connected: false }, { headers });
    }
    if (body.make === true) {
      const token = await makeFeed(body.owner);
      return Response.json({ connected: true, link: `${new URL(req.url).origin}/api/feed/${token}` }, { headers });
    }
    return Response.json({ connected: await hasFeed(body.owner) }, { headers });
  });
}
