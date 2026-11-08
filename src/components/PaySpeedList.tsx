"use client";

import { Timer } from "lucide-react";
import { dayCount, type PayerSpeed } from "@/lib/owed";
import { Avatar, ICON, Section, cx } from "./ui";

/** Friends ranked by how fast they pay you. */
export function PaySpeedList({ speed }: { speed: PayerSpeed[] }) {
  if (speed.length < 2) return null;
  return (
    <Section title="Who pays fastest">
      <ol className="card rows overflow-hidden">
        {speed.map((p, i) => {
          const d = Math.round(p.days);
          const bills = p.paid + p.unpaid;
          return (
            <li key={p.key} className="flex min-h-[60px] items-center gap-3 py-2 pr-5 pl-4">
              <span className="w-6 shrink-0 text-center text-[15px] font-bold text-ink-2 tabular-nums">{i + 1}</span>
              <Avatar person={p.look} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.look.name}</span>
                <span className="block text-[13px] text-ink-2">
                  {/* With a bill still unpaid, the average can only grow: "8+ days". */}
                  {p.unpaid > 0 ? `Pays in ${Math.max(d, 1)}+ ${Math.max(d, 1) === 1 ? "day" : "days"}` : d === 0 ? "Pays the same day" : `Pays in about ${dayCount(d)}`}
                  {" · "}
                  {bills} {bills === 1 ? "bill" : "bills"}
                </span>
              </span>
              {p.unpaid > 0 && (
                <span className={cx("flex shrink-0 items-center gap-1 text-[13px]", p.waiting >= 7 ? "font-semibold text-warn" : "text-ink-2")}>
                  <Timer size={16} {...ICON} aria-hidden />
                  {p.waiting === 0 ? "unpaid today" : `unpaid ${dayCount(p.waiting)}`}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="px-5 text-[13px] text-ink-2">Average days from the split to their payment; a bill they haven&apos;t paid counts the days so far.</p>
    </Section>
  );
}
