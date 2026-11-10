import { billDay } from "@/lib/draft";
import { payFrom, payTimes } from "@/lib/owed";
import { ownerBody } from "@/lib/server/board";
import { jsonError, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import {
  boardBills,
  boardHidden,
  boardOnBills,
  boardSkipped,
  boardStarts,
  isValidId,
  setBoardHidden,
  setBoardOnBills,
  setBoardSkipped,
  setBoardStarts,
  type HiddenPerson,
} from "@/lib/server/redis";

type Body = { hidden?: unknown; skipped?: unknown; starts?: unknown; onBills?: unknown };

/** Room for the most the lists below allow (100 people, 300 bills, 300 start times). */
const MAX_BYTES = 40_000;

/** For the organiser: everyone and every bill in "Who pays fastest", which are left out, and whether their bills link to it. */
export async function POST(req: Request, ctx: RouteContext<"/api/boards/[id]/hidden">) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  const { id } = await ctx.params;
  return safely(async () => {
    const o = await ownerBody<Body>(req, id, MAX_BYTES);
    if (!o.ok) return o.res;
    const [all, hidden, skipped, starts, onBills] = await Promise.all([boardBills(id), boardHidden(id), boardSkipped(id), boardStarts(id), boardOnBills(id)]);
    const bills = all ?? [];
    const people = payTimes(bills).map((p) => ({ key: p.key, ...p.look }));
    // Newest first, as in History.
    const list = bills
      // `from`: when it counts from without a start of the organiser's own; `start`: theirs, if set.
      .map((b) => ({ id: b.id, title: b.doc.title, day: billDay(b.doc), from: payFrom(b.doc, b.sharedAt), start: starts[b.id] ?? null, shared: !!b.sharedAt }))
      .sort((a, b) => b.day.localeCompare(a.day) || a.title.localeCompare(b.title));
    return Response.json({ people, hidden, bills: list, skipped, onBills }, { headers: { "Cache-Control": "no-store" } });
  });
}

/**
 * For the organiser: { owner, hidden: [{ key, name }], skipped: [billId], starts: { billId: ISO }, onBills }
 * replaces who's hidden, which bills don't count, and the start times they set; `onBills`
 * (left as it is when absent) says whether their bills link to "Who pays fastest".
 */
export async function PUT(req: Request, ctx: RouteContext<"/api/boards/[id]/hidden">) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  const { id } = await ctx.params;
  return safely(async () => {
    const o = await ownerBody<Body>(req, id, MAX_BYTES);
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
    const rawStarts = o.body.starts ?? {};
    if (typeof rawStarts !== "object" || rawStarts === null || Array.isArray(rawStarts) || Object.keys(rawStarts).length > 300) {
      return jsonError(400, "bad_request", "Invalid start times.");
    }
    const starts: Record<string, string> = {};
    for (const [billId, at] of Object.entries(rawStarts)) {
      const t = typeof at === "string" ? Date.parse(at) : NaN;
      if (!isValidId(billId) || !Number.isFinite(t)) return jsonError(400, "bad_request", "Invalid start times.");
      // Not in the future (a little slack for clocks).
      if (t > Date.now() + 5 * 60_000) return jsonError(400, "future_start", "A bill can't count from a time in the future.");
      starts[billId] = new Date(t).toISOString();
    }
    const onBills = o.body.onBills;
    if (onBills !== undefined && typeof onBills !== "boolean") return jsonError(400, "bad_request", "Invalid request.");
    await Promise.all([
      setBoardHidden(id, hidden),
      setBoardSkipped(id, skipped),
      setBoardStarts(id, starts),
      ...(onBills === undefined ? [] : [setBoardOnBills(id, onBills)]),
    ]);
    return Response.json({ hidden, skipped, starts, onBills: onBills ?? (await boardOnBills(id)) });
  });
}
