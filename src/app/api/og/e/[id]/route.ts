import { calculate } from "@/lib/calc";
import { eventPeople } from "@/lib/event";
import { getEvent, isValidId, storageReady } from "@/lib/server/redis";
import { shareImage } from "@/lib/server/shareImage";

/** Link preview image for a big bill (?v= only changes the URL, so previews refresh after edits). */
export async function GET(_req: Request, ctx: RouteContext<"/api/og/e/[id]">) {
  const { id } = await ctx.params;
  const e = isValidId(id) && storageReady ? await getEvent(id).catch(() => null) : null;
  let img: Response;
  if (!e) img = await shareImage(null);
  else {
    const people = eventPeople(e.bills);
    const date = new Date(`${e.meta.date}T12:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    img = await shareImage({
      kicker: `Big bill · ${date}`,
      title: e.meta.title,
      total: e.bills.reduce((s, b) => s + calculate(b.doc).total, 0),
      currency: e.bills[0]?.doc.currency ?? "THB",
      people,
      detail: `${e.bills.length} ${e.bills.length === 1 ? "bill" : "bills"} · ${people.length} people`,
    });
  }
  img.headers.set("Cache-Control", "public, max-age=300, s-maxage=86400");
  return img;
}
