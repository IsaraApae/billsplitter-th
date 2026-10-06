import { eventBody } from "@/lib/server/eventSchema";
import { jsonError, readJson, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { getEvent, isValidId, updateEvent } from "@/lib/server/redis";

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request, ctx: RouteContext<"/api/events/[id]">) {
  const limited = await rateLimit(req, "read");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Big bill not found.");
  return safely(async () => {
    const e = await getEvent(id);
    if (!e) return jsonError(404, "not_found", "This big bill doesn't exist or has expired.");
    return Response.json(e, { headers: noStore });
  });
}

/** Rename, change the date, or add/remove bills (new bills need their own tokens). */
export async function PUT(req: Request, ctx: RouteContext<"/api/events/[id]">) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Big bill not found.");
  return safely(async () => {
    const token = req.headers.get("x-edit-token") ?? "";
    const parsed = eventBody.safeParse(await readJson(req, 10_000));
    if (!parsed.success) return jsonError(422, "invalid", parsed.error.issues[0]?.message ?? "Invalid big bill.");
    const { title, date, splits } = parsed.data;
    const r = await updateEvent(id, token.slice(0, 100), { title, date }, splits);
    if (r === "not_found") return jsonError(404, "not_found", "This big bill doesn't exist or has expired.");
    if (r === "forbidden") return jsonError(403, "forbidden", "Only the organiser can change this big bill.");
    return Response.json({ id });
  });
}
