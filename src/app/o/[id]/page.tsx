import type { Metadata } from "next";
import { PartyPopper } from "lucide-react";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BoardShare } from "@/components/BoardShare";
import { BoardView } from "@/components/BoardView";
import { ICON, Money } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { whoStillOwes } from "@/lib/owed";
import { boardBills, isValidId, storageReady } from "@/lib/server/redis";

export const dynamic = "force-dynamic";

const loadBoard = cache(async (id: string) => {
  if (!isValidId(id) || !storageReady) return null;
  const bills = await boardBills(id).catch(() => null);
  return bills ? whoStillOwes(bills) : null;
});

export async function generateMetadata({ params }: PageProps<"/o/[id]">): Promise<Metadata> {
  const { id } = await params;
  const b = await loadBoard(id);
  if (!b) return { title: "List not found", robots: { index: false } };
  const title = `Owed to ${b.organiser.name}`;
  const description =
    b.people.length === 0
      ? "Everyone has paid."
      : `${formatMoney(b.total, b.currency)} still to pay from ${b.people.length} ${b.people.length === 1 ? "person" : "people"}.`;
  // Changes with the amounts, so a chat app's cached preview refreshes.
  const v = `${b.total.toString(36)}${b.people.length}`;
  const image = { url: `/api/og/o/${id}?v=${v}`, width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", siteName: "Bill Splitter", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

/** "Owed to Isara": everyone who still owes the organiser, A–Z, with their unpaid bills. */
export default async function BoardPage({ params }: PageProps<"/o/[id]">) {
  const { id } = await params;
  const b = await loadBoard(id);
  if (!b) notFound();
  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const n = b.people.length;
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 pb-32 md:pb-16">
      <header className="card px-6 pt-6 pb-5 text-center">
        <p className="text-[13px] text-ink-2">Still to pay · {today}</p>
        <h1 className="mt-1 flex items-center justify-center gap-2 text-[28px] leading-tight font-bold tracking-tight break-words">
          Owed to {b.organiser.name}
        </h1>
        {n === 0 ? (
          <p className="mt-4 flex items-center justify-center gap-2 text-[17px] font-semibold">
            <PartyPopper size={22} {...ICON} className="text-accent" aria-hidden /> Everyone has paid
          </p>
        ) : (
          <>
            <Money value={b.total} currency={b.currency} className="mt-3 block text-[48px] leading-none font-bold tracking-tight" />
            <p className="mt-2 text-[15px] text-ink-2">
              {n} {n === 1 ? "person" : "people"} · {b.billCount} {b.billCount === 1 ? "bill" : "bills"}
            </p>
          </>
        )}
      </header>

      <BoardView
        people={b.people.map((p) => ({ ...p, bills: p.bills.map((x) => ({ ...x, date: x.date.toISOString() })) }))}
        currency={b.currency}
        organiser={b.organiser.name}
        payment={b.payment}
      />

      {n > 0 && <p className="px-5 text-[13px] text-ink-2">Tap Pay to pay everything at once, or a bill to pay just that one.</p>}

      <BoardShare id={id} title={`Owed to ${b.organiser.name}`} />
    </main>
  );
}
