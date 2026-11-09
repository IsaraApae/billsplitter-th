import type { Metadata } from "next";
import { CheckCircle2, ChevronDown, ChevronLeft, Timer, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { FastestHide } from "@/components/FastestHide";
import { BillHeader } from "@/components/Poster";
import { Avatar, ICON, Money } from "@/components/ui";
import { langOf } from "@/lib/lang";
import { DAY, duration, payTimes, whoStillOwes, withoutHidden, type PayerTimes } from "@/lib/owed";
import { boardBills, boardHidden, isValidId, storageReady } from "@/lib/server/redis";

export const dynamic = "force-dynamic";

const load = cache(async (id: string) => {
  if (!isValidId(id) || !storageReady) return null;
  const [bills, hidden] = await Promise.all([boardBills(id), boardHidden(id)]); // a storage failure shows the error page
  if (!bills) return null;
  // People the organiser chose to hide aren't ranked at all.
  return { organiser: whoStillOwes(bills).organiser, times: withoutHidden(payTimes(bills, Date.now()), hidden), billCount: bills.length };
});

export async function generateMetadata({ params }: PageProps<"/o/[id]/fastest">): Promise<Metadata> {
  const { id } = await params;
  const b = await load(id);
  if (!b) return { title: "List not found", robots: { index: false } };
  const title = `Who pays ${b.organiser.name} fastest`;
  const first = b.times[0];
  const description = first
    ? `${first.look.name} pays fastest: ${duration(first.avgMs)} on average. Everyone ranked, bill by bill.`
    : "Everyone ranked by how fast they pay, once they've paid.";
  // Changes with the ranking, so a chat app's cached preview refreshes.
  const v = shortHash(b.times.map((p) => `${p.key}:${Math.round(p.avgMs / 3_600_000)}`).join());
  const image = { url: `/api/og/f/${id}?v=${v}`, width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", siteName: "Bill Splitter", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

/** Class names, skipping false ones (ui.tsx's cx is client-only; this page renders on the server). */
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const shortDate = (day: string) => new Date(`${day}T12:00:00+07:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
const paidOn = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

/** "Who pays fastest": everyone ranked by how long they take to pay the organiser, with every bill's time. */
export default async function FastestPage({ params }: PageProps<"/o/[id]/fastest">) {
  const { id } = await params;
  const b = await load(id);
  if (!b) notFound();
  const n = b.times.length;
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 pb-6 md:pb-16">
      <BillHeader title="Who pays fastest" details={n === 0 ? "No payments yet" : `Paying ${b.organiser.name} · ${n} ${n === 1 ? "person" : "people"} · ${b.billCount} ${b.billCount === 1 ? "bill" : "bills"}`} />

      <div className="flex items-center justify-between gap-2">
        <Link href={`/o/${id}`} className="inline-flex min-h-10 items-center gap-1 px-1 font-semibold text-accent">
          <ChevronLeft size={20} {...ICON} aria-hidden /> Owed to {b.organiser.name}
        </Link>
        <FastestHide id={id} />
      </div>

      {n === 0 ? (
        <p className="card p-8 text-center text-ink-2">Once friends are ticked paid, they&apos;re ranked here.</p>
      ) : (
        <Podium top={b.times.slice(0, 5)} />
      )}

      {n > 0 && (
        <ol className="space-y-3">
          {b.times.map((p, i) => (
            <PayerCard key={p.key} p={p} rank={i + 1} />
          ))}
        </ol>
      )}

      <p className="px-5 text-[13px] text-ink-2">
        Time from when a bill was made (or its date, if later) to the tick. A bill not paid yet counts the time so far, so it moves them down.
        Times are in Thailand time.
      </p>
    </main>
  );
}

function PayerCard({ p, rank }: { p: PayerTimes; rank: number }) {
  const bills = p.paid + p.unpaid;
  const late = p.waitingMs >= 7 * DAY;
  return (
    <li className="card overflow-hidden">
      <details className="group">
        <summary className="flex min-h-[76px] cursor-pointer list-none items-center gap-3 py-3 pr-4 pl-4 [&::-webkit-details-marker]:hidden">
          <span className="flex w-7 shrink-0 justify-center text-[17px] font-bold text-ink-2 tabular-nums">
            {rank === 1 ? <Trophy size={20} {...ICON} className="text-accent" aria-label="First" /> : rank}
          </span>
          <Avatar person={p.look} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-semibold" {...langOf(p.look.name)}>
              {p.look.name}
            </span>
            <span className="block text-[13px] text-ink-2">
              {p.unpaid > 0 ? "So far " : "Pays in "}
              <b className="font-semibold text-ink">{duration(p.avgMs)}</b> on average · {bills} {bills === 1 ? "bill" : "bills"}
            </span>
            {p.paid > 1 && (
              <span className="block text-[13px] text-ink-2">
                Fastest {duration(p.fastestMs!)} · slowest {duration(p.slowestMs!)}
              </span>
            )}
            {p.unpaid > 0 && (
              <span className={cx("flex items-center gap-1 text-[13px]", late ? "font-semibold text-warn" : "text-ink-2")}>
                <Timer size={14} {...ICON} aria-hidden className="shrink-0" />
                {p.unpaid} unpaid · waiting {duration(p.waitingMs)}
              </span>
            )}
          </span>
          <ChevronDown size={20} {...ICON} aria-hidden className="shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="rows border-t border-[var(--line)]">
          {p.bills.map((x) => {
            const paid = x.paidAt !== undefined;
            return (
              <li key={x.id} className="flex items-center gap-3 py-2.5 pr-4 pl-5">
                {paid ? (
                  <CheckCircle2 size={18} {...ICON} className="shrink-0 text-accent" aria-label="Paid" />
                ) : (
                  <Timer size={18} {...ICON} className={cx("shrink-0", x.ms >= 7 * DAY ? "text-warn" : "text-ink-3")} aria-label="Unpaid" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium" {...langOf(x.title)}>
                    {x.title}
                  </span>
                  <span className="block text-[13px] text-ink-2">
                    {shortDate(x.day)} ·{" "}
                    {paid ? (
                      <>
                        paid after <b className="font-semibold text-ink">{duration(x.ms)}</b> ({paidOn(x.paidAt!)})
                      </>
                    ) : (
                      <span className={cx(x.ms >= 7 * DAY && "font-semibold text-warn")}>unpaid for {duration(x.ms)}</span>
                    )}
                  </span>
                </span>
                <Money value={x.amount} currency={x.currency} className="text-[15px] font-semibold" />
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}

/** Step heights by place, and the order they stand in: 4th, 2nd, 1st, 3rd, 5th (as on the link preview). */
const STEP = ["h-32", "h-24", "h-[4.5rem]", "h-14", "h-11"];
const STAND = [3, 1, 0, 2, 4];

/** The top five on a podium: initial, name and average time to pay, on their step. */
function Podium({ top }: { top: PayerTimes[] }) {
  return (
    <div className="card px-3 pt-5 pb-0" aria-label="Top five">
      <ol className="flex items-end justify-center gap-1.5">
        {STAND.map((i) => {
          const p = top[i];
          const first = i === 0;
          // Five places always; one nobody has reached yet is an empty step.
          if (!p)
            return (
              <li key={`empty${i}`} className="flex w-1/5 max-w-24 min-w-0 flex-col items-center">
                <span className={cx("flex w-full justify-center rounded-t-[8px] pt-1.5 text-[20px] font-bold text-ink-3 tabular-nums opacity-60", STEP[i], "bg-[var(--field)]")}>
                  <span className="sr-only">Place </span>
                  {i + 1}
                </span>
              </li>
            );
          return (
            <li key={p.key} className="flex w-1/5 max-w-24 min-w-0 flex-col items-center">
              {first && <Trophy size={20} {...ICON} className="mb-1 text-accent" aria-hidden />}
              <Avatar person={p.look} size={first ? 48 : 38} />
              <span className="mt-1 w-full truncate text-center text-[13px] font-semibold" {...langOf(p.look.name)}>
                {p.look.name}
              </span>
              <span className={cx("mb-1.5 w-full truncate text-center text-[11px]", first ? "font-semibold text-accent" : "text-ink-2")}>{duration(p.avgMs)}</span>
              <span
                className={cx(
                  "flex w-full justify-center rounded-t-[8px] pt-1.5 text-[20px] font-bold tabular-nums",
                  STEP[i],
                  first ? "bg-accent-fill text-accent-ink" : "bg-[var(--field)] text-ink-2",
                )}
              >
                <span className="sr-only">Place </span>
                {i + 1}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
