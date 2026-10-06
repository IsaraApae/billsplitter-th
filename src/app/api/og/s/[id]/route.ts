import { calculate } from "@/lib/calc";
import { billDate } from "@/lib/draft";
import { shareImage } from "@/lib/server/shareImage";
import { loadSplit } from "@/lib/server/splits";

/** Link preview image for a split (?v= only changes the URL, so previews refresh after edits). */
export async function GET(_req: Request, ctx: RouteContext<"/api/og/s/[id]">) {
  const { id } = await ctx.params;
  const s = await loadSplit(id);
  const img = s
    ? await shareImage({
        kicker: billDate(s.doc).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
        title: s.doc.title,
        total: calculate(s.doc).total,
        currency: s.doc.currency,
        people: s.doc.people,
        detail: `${s.doc.people.length} ${s.doc.people.length === 1 ? "person" : "people"} · ${s.doc.mode === "equal" ? "split equally" : "split by item"}`,
      })
    : await shareImage(null);
  img.headers.set("Cache-Control", "public, max-age=300, s-maxage=86400");
  return img;
}
