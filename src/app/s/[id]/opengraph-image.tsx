import { calculate } from "@/lib/calc";
import { billDate } from "@/lib/draft";
import { shareImage, shareImageSize } from "@/lib/server/shareImage";
import { loadSplit } from "@/lib/server/splits";

export const alt = "Bill split summary";
export const size = shareImageSize;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await loadSplit(id);
  if (!s) return shareImage(null);
  const n = s.doc.people.length;
  return shareImage({
    kicker: billDate(s.doc).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    title: s.doc.title,
    total: calculate(s.doc).total,
    currency: s.doc.currency,
    people: s.doc.people,
    detail: `${n} ${n === 1 ? "person" : "people"} · ${s.doc.mode === "equal" ? "split equally" : "split by item"}`,
  });
}
