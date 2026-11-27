"use client";

import { Hourglass } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { duration } from "@/lib/owed";
import { langOf } from "@/lib/lang";
import { ICON } from "./ui";

/**
 * "Ploy passes them in 2 days 4 hr": a countdown to when a friend ranked below this
 * (still unpaid) person passes them. Starts from the server's clock, so the page and the
 * phone show the same first; when it runs out, the page reloads in the new order.
 */
export function FastestPassCountdown({ at, by, serverNow }: { at: number; by: string; serverNow: number }) {
  const router = useRouter();
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    // Within the hour it shows minutes, so tick each half minute; else each minute is plenty.
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  const left = at - now;
  useEffect(() => {
    if (left <= 0) router.refresh();
  }, [left <= 0, router]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className="flex items-center gap-1 text-[13px] text-ink-2">
      <Hourglass size={14} {...ICON} aria-hidden className="shrink-0" />
      <span>
        <b className="font-semibold text-ink" {...langOf(by)}>
          {by}
        </b>{" "}
        {left > 0 ? (
          <>
            passes them in <b className="font-semibold text-ink tabular-nums">{duration(left)}</b>
          </>
        ) : (
          "is passing them now"
        )}
      </span>
    </span>
  );
}
