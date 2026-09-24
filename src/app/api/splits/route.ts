import { parseSplitDoc } from "@/lib/schema";
import { jsonError, readJson, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { createSplit, touchOwner } from "@/lib/server/redis";

export async function POST(req: Request) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  return safely(async () => {
    const body = await readJson(req);
    if (body === undefined) return jsonError(400, "bad_request", "Invalid or too-large request.");
    const parsed = parseSplitDoc(body);
    if (!parsed.ok) return jsonError(422, "invalid", parsed.error);
    const { id, token } = await createSplit(parsed.doc);
    if (parsed.doc.payment.ownerId) await touchOwner(parsed.doc.payment.ownerId);
    return Response.json({ id, token }, { status: 201 });
  });
}
