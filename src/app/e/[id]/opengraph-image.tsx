import { calculate } from "@/lib/calc";
import { eventPeople } from "@/lib/event";
import { getEvent, isValidId, storageReady } from "@/lib/server/redis";
import { shareImage, shareImageSize } from "@/lib/server/shareImage";

export const alt = "Big bill summary";
export const size = shareImageSize;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = isValidId(id) && storageReady ? await getEvent(id).catch(() => null) : null;
  if (!e) return shareImage(null);
  const people = eventPeople(e.bills);
  const date = new Date(`${e.meta.date}T12:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return shareImage({
    kicker: `Big bill · ${date}`,
    title: e.meta.title,
    total: e.bills.reduce((s, b) => s + calculate(b.doc).total, 0),
    currency: e.bills[0]?.doc.currency ?? "THB",
    people,
    detail: `${e.bills.length} ${e.bills.length === 1 ? "bill" : "bills"} · ${people.length} people`,
  });
}
