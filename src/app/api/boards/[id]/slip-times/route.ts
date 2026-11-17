import { ownerBody } from "@/lib/server/board";
import { jsonError, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { doneReading, setSlipTime, slipsWithoutTime, startReading } from "@/lib/server/redis";
import { readSlipTime } from "@/lib/server/slipRead";

export const maxDuration = 60;

/** Slips read at once. */
const AT_ONCE = 3;
/** As for receipt times: answer inside maxDuration, and carry on next time with what's left. */
const DEADLINE_MS = 50_000;
const LEAST_MS = 8_000;

/**
 * For the organiser, when their Who pays fastest opens: reads the transfer time printed on
 * slips kept before slip times were read, and keeps it with the slip, so the ranking counts
 * from when the money really moved. Each slip is read once. { owner } → { read, left }
 * (`read`: slips whose time was found now; `left`: still to read, ask again).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/boards/[id]/slip-times">) {
  const limited = await rateLimit(req, "scan");
  if (limited) return limited;
  const { id } = await ctx.params;
  return safely(async () => {
    const o = await ownerBody(req, id, 2_000);
    if (!o.ok) return o.res;
    // Nothing can read them (local development without a key): nothing to do.
    if (!process.env.GEMINI_API_KEY) return Response.json({ read: 0, left: 0 }, { headers: { "Cache-Control": "no-store" } });
    if (!(await startReading(id, "slips"))) return jsonError(409, "busy", "The slips are already being read.");
    try {
      const started = Date.now();
      const todo = await slipsWithoutTime(id);
      let read = 0;
      let later = 0;
      for (let i = 0; i < todo.length; i += AT_ONCE) {
        const left = DEADLINE_MS - (Date.now() - started);
        if (left < LEAST_MS) {
          later += todo.length - i;
          break;
        }
        const batch = todo.slice(i, i + AT_ONCE);
        // No picture or date to read it from: nothing more to learn, so it isn't asked about again.
        const times = await Promise.all(
          batch.map((s) => (s.photo && s.date ? readSlipTime(s.photo, s.date, left).catch(() => undefined) : Promise.resolve(null))),
        );
        await Promise.all(
          batch.map(async (s, k) => {
            const t = times[k];
            if (t === undefined) return void later++; // couldn't be read just now: next time
            if (t) read++;
            await setSlipTime(s.bill, s.reference, t);
          }),
        );
      }
      return Response.json({ read, left: later }, { headers: { "Cache-Control": "no-store" } });
    } finally {
      await doneReading(id, "slips").catch(() => {});
    }
  });
}
