import { payTimes } from "@/lib/owed";
import { jsonError, readJson, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { boardBills, boardHidden, isOrganiserKey, isValidId, ownsBoard, setBoardHidden, type HiddenPerson } from "@/lib/server/redis";

type Body = { owner?: unknown; hidden?: unknown };

/** Checks the caller is the phone this list belongs to (its key goes in the body, never the URL). */
async function owner(req: Request, id: string): Promise<{ ok: true; body: Body } | { ok: false; res: Response }> {
  if (!isValidId(id)) return { ok: false, res: jsonError(404, "not_found", "List not found.") };
  const body = (await readJson(req, 8_000)) as Body | undefined;
  if (typeof body?.owner !== "string" || !isOrganiserKey(body.owner)) return { ok: false, res: jsonError(400, "bad_request", "Invalid request.") };
  if (!(await ownsBoard(id, body.owner))) return { ok: false, res: jsonError(403, "forbidden", "Only the organiser can change this.") };
  return { ok: true, body };
}

/** For the organiser: everyone in "Who pays fastest" (hidden or not), and who is hidden. */
export async function POST(req: Request, ctx: RouteContext<"/api/boards/[id]/hidden">) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  const { id } = await ctx.params;
  return safely(async () => {
    const o = await owner(req, id);
    if (!o.ok) return o.res;
    const [bills, hidden] = await Promise.all([boardBills(id), boardHidden(id)]);
    const people = payTimes(bills ?? []).map((p) => ({ key: p.key, ...p.look }));
    return Response.json({ people, hidden }, { headers: { "Cache-Control": "no-store" } });
  });
}

/** For the organiser: { owner, hidden: [{ key, name }] } replaces who is hidden. */
export async function PUT(req: Request, ctx: RouteContext<"/api/boards/[id]/hidden">) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  const { id } = await ctx.params;
  return safely(async () => {
    const o = await owner(req, id);
    if (!o.ok) return o.res;
    const raw = o.body.hidden;
    if (!Array.isArray(raw) || raw.length > 100) return jsonError(400, "bad_request", "Invalid list.");
    const hidden: HiddenPerson[] = [];
    for (const h of raw) {
      if (!h || typeof h.key !== "string" || typeof h.name !== "string" || h.key.length > 40 || h.name.length > 80) {
        return jsonError(400, "bad_request", "Invalid list.");
      }
      hidden.push({ key: h.key, name: h.name });
    }
    await setBoardHidden(id, hidden);
    return Response.json({ hidden });
  });
}
