import { whoStillOwes } from "@/lib/owed";
import { boardBills, isValidId, storageReady } from "@/lib/server/redis";
import { shareImage } from "@/lib/server/shareImage";

/** Link preview for a "who still owes" list (?v= only changes the URL, so previews refresh). */
export async function GET(_req: Request, ctx: RouteContext<"/api/og/o/[id]">) {
  const { id } = await ctx.params;
  const bills = isValidId(id) && storageReady ? await boardBills(id).catch(() => null) : null;
  let img: Response;
  if (!bills) img = await shareImage(null);
  else {
    const b = whoStillOwes(bills);
    const n = b.people.length;
    img = await shareImage({
      kicker: new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
      title: `Owed to ${b.organiser.name}`,
      total: b.total,
      currency: b.currency,
      people: b.people.map((p) => p.look),
      detail: n === 0 ? "Everyone has paid" : `${n} ${n === 1 ? "person" : "people"} · ${b.billCount} ${b.billCount === 1 ? "bill" : "bills"}`,
      label: "STILL TO PAY",
      cta: "See who owes →",
      tagline: "Everyone who hasn't paid yet, and for what",
    });
  }
  img.headers.set("Cache-Control", "public, max-age=300, s-maxage=3600");
  return img;
}
