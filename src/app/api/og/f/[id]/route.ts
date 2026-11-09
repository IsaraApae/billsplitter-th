import { duration, payTimes, whoStillOwes } from "@/lib/owed";
import { boardBills, isValidId, storageReady } from "@/lib/server/redis";
import { rateLimit } from "@/lib/server/ratelimit";
import { shareImage } from "@/lib/server/shareImage";

/** Link preview for "Who pays fastest" (?v= only changes the URL, so previews refresh). */
export async function GET(req: Request, ctx: RouteContext<"/api/og/f/[id]">) {
  const limited = await rateLimit(req, "og");
  if (limited) return limited;
  const { id } = await ctx.params;
  const bills = isValidId(id) && storageReady ? await boardBills(id).catch(() => null) : null;
  let img: Response;
  if (!bills) img = await shareImage(null);
  else {
    const times = payTimes(bills);
    const first = times[0];
    const n = times.length;
    img = await shareImage({
      kicker: "", // no date: the ranking is what matters
      title: `Who pays ${whoStillOwes(bills).organiser.name} fastest`,
      total: 0,
      currency: "THB",
      people: times.map((p) => p.look),
      // The top five on a podium; with nobody ranked yet, the plain card.
      podium: n > 0 ? times.slice(0, 5).map((p) => ({ name: p.look.name, color: p.look.color, time: duration(p.avgMs) })) : undefined,
      headline: n > 0 ? undefined : "No payments yet",
      detail: first ? `${duration(first.avgMs)} on average · ${n} ${n === 1 ? "person" : "people"}` : "Nobody has paid yet",
      cta: "See the ranking →",
      tagline: "Everyone ranked by how fast they pay, bill by bill",
    });
  }
  img.headers.set("Cache-Control", "public, max-age=300, s-maxage=3600");
  return img;
}
