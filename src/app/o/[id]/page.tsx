import type { Metadata } from "next";
import { ChevronRight, PartyPopper } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PaidMark } from "@/components/Payments";
import { BoardShare } from "@/components/BoardShare";
import { Avatar, ICON, Money } from "@/components/ui";
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

      {b.people.map((p) => (
        <section key={p.key} className="space-y-2" aria-label={p.look.name}>
          <div className="flex items-center gap-3 px-2">
            <Avatar person={p.look} size={32} />
            <h2 className="min-w-0 flex-1 truncate text-[19px] font-bold">{p.look.name}</h2>
            <Money value={p.total} currency={b.currency} className="text-[19px] font-bold tracking-tight" />
          </div>
          <ul className="card rows overflow-hidden">
            {p.bills.map((bill) => (
              <li key={bill.id}>
                <Link href={`/s/${bill.id}`} className="flex min-h-[60px] items-center gap-3 py-2 pr-3 pl-4">
                  <PaidMark status={bill.part ? "part" : "none"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{bill.title}</span>
                    <span className="block text-[13px] text-ink-2">
                      {bill.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {bill.part && <span className="font-semibold text-accent"> · Part paid</span>}
                    </span>
                  </span>
                  <span className="text-right leading-tight">
                    {bill.part && <span className="block text-[11px] text-ink-2">left to pay</span>}
                    <Money value={bill.left} currency={b.currency} className="text-[17px] font-bold tracking-tight" />
                  </span>
                  <ChevronRight size={20} {...ICON} className="shrink-0 text-ink-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {n > 0 && <p className="px-5 text-[13px] text-ink-2">Tap a bill to pay it or upload your slip.</p>}

      <BoardShare id={id} title={`Owed to ${b.organiser.name}`} />
    </main>
  );
}
