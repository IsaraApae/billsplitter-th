"use client";

import { Hourglass } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { langOf } from "@/lib/lang";
import type { Person } from "@/lib/types";
import { Avatar, ICON } from "./ui";

type Look = Pick<Person, "name" | "emoji" | "color">;

const pad = (n: number) => String(n).padStart(2, "0");
/** "3d 19:42:10", "19:42:10" */
function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const hms = `${pad(Math.floor((s % 86_400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}d ${hms}` : hms;
}
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/**
 * On top of Who pays fastest: the next place change, ticking down each second ("Bank passes
 * Ploy for 2nd in 3d 19:42:10"). Starts from the server's clock, so the page and the phone
 * agree at first; when it runs out, the page reloads in the new order.
 */
export function FastestNextPass({ at, by, who, place, serverNow }: { at: number; by: Look; who: Look; place: number; serverNow: number }) {
  const router = useRouter();
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  const left = at - now;
  const done = left <= 0;
  useEffect(() => {
    if (done) router.refresh();
  }, [done, router]);
  return (
    <section className="card px-4 py-3 text-center" aria-label="Next place change">
      <p className="flex items-center justify-center gap-1 text-[13px] font-semibold text-ink-2">
        <Hourglass size={14} {...ICON} aria-hidden /> Next place change {done ? "now" : "in"}
      </p>
      {/* Read out once, not every second. */}
      <p className="mt-0.5 text-[32px] leading-tight font-bold tracking-tight tabular-nums" aria-live="off">
        {clock(left)}
      </p>
      <p className="mt-1 flex items-center justify-center gap-2 text-[15px]">
        <span className="flex shrink-0 -space-x-2" aria-hidden>
          <Avatar person={by} size={28} />
          <Avatar person={who} size={28} />
        </span>
        <span className="min-w-0">
          <b className="font-semibold" {...langOf(by.name)}>
            {by.name}
          </b>{" "}
          passes{" "}
          <b className="font-semibold" {...langOf(who.name)}>
            {who.name}
          </b>{" "}
          for {ordinal(place)}
        </span>
      </p>
    </section>
  );
}
