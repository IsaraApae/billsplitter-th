"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PLACE_COLORS } from "@/lib/colors";
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
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/** One racer: avatar and name, the one being caught wearing their place. */
function Racer({ look, place }: { look: Look; place?: number }) {
  const color = place ? PLACE_COLORS[place - 1] : undefined;
  return (
    <span className="flex w-16 shrink-0 flex-col items-center gap-1">
      <span className="relative">
        <Avatar person={look} size={44} />
        {place && (
          <span
            className="absolute -top-1 -right-2 rounded-full px-1.5 text-[11px] font-bold shadow-sm"
            style={{ background: color?.fill ?? "var(--field)", color: color?.ink ?? "var(--ink)" }}
          >
            {ordinal(place)}
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-[13px] font-semibold" {...langOf(look.name)}>
        {look.name}
      </span>
    </span>
  );
}

/**
 * On top of Who pays fastest: the next place change as a race, the friend below chasing the
 * unpaid one along a track, with a clock ticking down each second. Starts from the server's
 * clock, so the page and the phone agree at first; when it runs out, the page reloads in the
 * new order.
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
    <section className="card px-4 pt-3 pb-4" aria-label={`Next place change: ${by.name} passes ${who.name} for ${ordinal(place)}`}>
      <p className="section-label text-center">Next place change</p>
      <div className="mt-3 flex items-center gap-2">
        <Racer look={by} />
        <span className="flex min-w-0 flex-1 flex-col items-center">
          {/* Read out once (in the label), not every second. */}
          <span className="text-[24px] leading-none font-bold tracking-tight tabular-nums" aria-hidden>
            {done ? "Now" : clock(left)}
          </span>
          <span className="mt-2 flex w-full items-center" aria-hidden>
            <span className="h-[3px] flex-1 rounded-full bg-[repeating-linear-gradient(90deg,var(--accent-fill)_0_8px,transparent_8px_14px)]" />
            <ArrowRight size={18} {...ICON} className="-ml-1 text-accent" />
          </span>
          <span className="mt-1 text-[12px] text-ink-2" aria-hidden>
            {done ? "passing now" : "catching up"}
          </span>
        </span>
        <Racer look={who} place={place} />
      </div>
    </section>
  );
}
