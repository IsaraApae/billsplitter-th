import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventView } from "@/components/EventView";
import { calculate } from "@/lib/calc";
import { formatMoney } from "@/lib/money";
import { resolveQr } from "@/lib/server/payQr";
import { getEvent, isValidId, storageReady } from "@/lib/server/redis";

async function load(id: string) {
  if (!isValidId(id) || !storageReady) return null;
  return getEvent(id).catch(() => null);
}

export async function generateMetadata({ params }: PageProps<"/e/[id]">): Promise<Metadata> {
  const { id } = await params;
  const e = await load(id);
  if (!e) return { title: "Big bill not found", robots: { index: false } };
  const total = e.bills.reduce((s, b) => s + calculate(b.doc).total, 0);
  const currency = e.bills[0]?.doc.currency ?? "THB";
  const description = `${e.bills.length} bills, ${formatMoney(total, currency)} in total. Tap to see what you owe for all of them.`;
  return {
    title: e.meta.title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title: e.meta.title, description, type: "website", siteName: "Bill Splitter" },
  };
}

export default async function EventPage({ params }: PageProps<"/e/[id]">) {
  const { id } = await params;
  const e = await load(id);
  if (!e) notFound();
  // The organiser's payment details from their newest bill.
  const newest = [...e.bills].sort((a, b) => b.doc.createdAt.localeCompare(a.doc.createdAt))[0];
  const qr = newest ? await resolveQr(newest.doc) : null;
  // Re-mounts after the organiser edits the big bill (new bills or title).
  return <EventView key={e.meta.updatedAt} id={id} meta={e.meta} initialBills={e.bills} qr={qr} />;
}
