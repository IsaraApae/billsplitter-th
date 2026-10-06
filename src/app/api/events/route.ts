import { eventBody } from "@/lib/server/eventSchema";
import { jsonError, readJson, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { createEvent } from "@/lib/server/redis";

/** Create a big bill from splits the caller can edit (their edit tokens prove it). */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  return safely(async () => {
    const parsed = eventBody.safeParse(await readJson(req, 10_000));
    if (!parsed.success) return jsonError(422, "invalid", parsed.error.issues[0]?.message ?? "Invalid big bill.");
    const { title, date, splits } = parsed.data;
    if (splits.some((s) => !s.token)) return jsonError(403, "forbidden", "You can only combine your own splits.");
    const r = await createEvent({ title, date }, splits as { id: string; token: string }[]);
    if (r === "forbidden") return jsonError(403, "forbidden", "You can only combine your own splits.");
    return Response.json(r, { status: 201 });
  });
}
