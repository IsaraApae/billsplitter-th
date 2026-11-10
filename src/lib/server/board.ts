import "server-only";
import { payTimes, withoutHidden, withStarts, type PayerTimes } from "../owed";
import { jsonError, readJson } from "./http";
import { boardBills, boardHidden, boardSkipped, boardStarts, isOrganiserKey, isValidId, ownsBoard } from "./redis";

type Bills = NonNullable<Awaited<ReturnType<typeof boardBills>>>;

/**
 * "Who pays fastest" for a list, for the page and its link preview alike: bills the organiser
 * left out don't count, their own start times do, and people they chose to hide aren't ranked.
 * Null if there's no such list.
 */
export async function fastestRanking(id: string, now = Date.now()): Promise<{ bills: Bills; times: PayerTimes[]; billCount: number } | null> {
  const [bills, hidden, skipped, starts] = await Promise.all([boardBills(id), boardHidden(id), boardSkipped(id), boardStarts(id)]);
  if (!bills) return null;
  const counted = withStarts(
    bills.filter((b) => !skipped.includes(b.id)),
    starts,
  );
  return { bills, times: withoutHidden(payTimes(counted, now), hidden), billCount: counted.length };
}

/**
 * Reads a request's JSON body and checks it comes from the phone list `id` belongs to
 * (the phone's key goes in the body as `owner`, never in the URL).
 */
export async function ownerBody<T extends object>(
  req: Request,
  id: string,
  maxBytes: number,
): Promise<{ ok: true; body: T & { owner: string } } | { ok: false; res: Response }> {
  if (!isValidId(id)) return { ok: false, res: jsonError(404, "not_found", "List not found.") };
  const body = (await readJson(req, maxBytes)) as (T & { owner?: unknown }) | undefined;
  if (typeof body?.owner !== "string" || !isOrganiserKey(body.owner)) return { ok: false, res: jsonError(400, "bad_request", "Invalid request.") };
  if (!(await ownsBoard(id, body.owner))) return { ok: false, res: jsonError(403, "forbidden", "Only the organiser can do this.") };
  return { ok: true, body: body as T & { owner: string } };
}
