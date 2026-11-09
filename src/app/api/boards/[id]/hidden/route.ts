import { billDay } from "@/lib/draft";
import { payTimes } from "@/lib/owed";
import { jsonError, readJson, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import {
  boardBills,
  boardHidden,
  boardSkipped,
  isOrganiserKey,
  isValidId,
  ownsBoard,
  setBoardHidden,
  setBoardSkipped,
  type HiddenPerson,
} from "@/lib/server/redis";

type Body = { owner?: unknown; hidden?: unknown; skipped?: unknown };

/** Checks the caller is the phone this list belongs to (its key goes in the body, never the URL). */
async function owner(req: Request, id: string): Promise<{ ok: true; body: Body } | { ok: false; res: Response }> {
  if (!isValidId(id)) return { ok: false, res: jsonError(404, "not_found", "List not found.") };
  const body = (await readJson(req, 8_000)) as Body | undefined;
  if (typeof body?.owner !== "string" || !isOrganiserKey(body.owner)) return { ok: false, res: jsonError(400, "bad_request", "Invalid request.") };
  if (!(await ownsBoard(id, body.owner))) return { ok: false, res: jsonError(403, "forbidden", "Only the organiser can change this.") };
  return { ok: true, body };
}

/** For the organiser: everyone and every bill in "Who pays fastest", and which are left out. */
export async function POST(req: Request, ctx: RouteContext<"/api/boards/[id]/hidden">) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  const { id } = await ctx.params;
  return safely(async () => {
    const o = await owner(req, id);
    if (!o.ok) return o.res;
    const [all, hidden, skipped] = await Promise.all([boardBills(id), boardHidden(id), boardSkipped(id)]);
    const bills = all ?? [];
    const people = payTimes(bills).map((p) => ({ key: p.key, ...p.look }));
    // Newest first, as in History.
    const list = bills
      .map((b) => ({ id: b.id, title: b.doc.title, day: billDay(b.doc) }))
      .sort((a, b) => b.day.localeCompare(a.day) || a.title.localeCompare(b.title));
    return Response.json({ people, hidden, bills: list, skipped }, { headers: { "Cache-Control": "no-store" } });
  });
}

/** For the organiser: { owner, hidden: [{ key, name }], skipped: [billId] } replaces what's left out. */
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
    const rawSkipped = o.body.skipped ?? [];
    if (!Array.isArray(rawSkipped) || rawSkipped.length > 300 || !rawSkipped.every((x) => typeof x === "string" && isValidId(x))) {
      return jsonError(400, "bad_request", "Invalid list.");
    }
    const skipped = [...new Set(rawSkipped as string[])];
    await Promise.all([setBoardHidden(id, hidden), setBoardSkipped(id, skipped)]);
    return Response.json({ hidden, skipped });
  });
}
