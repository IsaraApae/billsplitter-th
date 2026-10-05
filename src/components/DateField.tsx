"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { toDay } from "@/lib/draft";
import { ICON, Sheet, cx } from "./ui";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shift(day: string, days: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + days);
  return toDay(d);
}

/**
 * A date row value that opens the app's own calendar sheet (not the phone's
 * native picker). `value` and `onChange` use YYYY-MM-DD.
 */
export function DateField({ value, onChange, label }: { value: string; onChange: (day: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(value);
  // First day of the month being shown.
  const [month, setMonth] = useState(() => parseDay(value));
  const today = toDay(new Date());

  function show() {
    setPicked(value);
    setMonth(parseDay(value));
    setOpen(true);
  }

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDay(new Date(month.getFullYear(), month.getMonth(), i + 1))),
  ];
  const atThisMonth = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();
  const step = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const pick = (day: string) => {
    setPicked(day);
    setMonth(parseDay(day));
  };

  return (
    <>
      <button
        type="button"
        className="press glass-flat inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-ink tnum"
        aria-label={`${label}: ${parseDay(value).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
        onClick={show}
      >
        <CalendarDays size={20} {...ICON} aria-hidden className="text-accent" />
        {parseDay(value).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        subtitle={parseDay(picked).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        confirmLabel="Use this date"
        onConfirm={() => {
          onChange(picked);
          setOpen(false);
        }}
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            {[
              { day: today, text: "Today" },
              { day: shift(today, -1), text: "Yesterday" },
            ].map((c) => (
              <button key={c.text} type="button" className={picked === c.day ? "chip-on" : "chip"} onClick={() => pick(c.day)}>
                {c.text}
              </button>
            ))}
          </div>

          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => step(-1)}>
                <ChevronLeft size={22} {...ICON} />
              </button>
              <p className="font-semibold" aria-live="polite">
                {month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </p>
              <button type="button" className="icon-btn disabled:opacity-30" aria-label="Next month" disabled={atThisMonth} onClick={() => step(1)}>
                <ChevronRight size={22} {...ICON} />
              </button>
            </div>
            <div className="grid grid-cols-7 text-center text-[13px] text-ink-2" aria-hidden>
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="py-1">
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 place-items-center gap-y-1" role="grid" aria-label="Days">
              {cells.map((day, i) =>
                day ? (
                  <button
                    key={day}
                    type="button"
                    disabled={day > today}
                    aria-pressed={day === picked}
                    aria-label={parseDay(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                    onClick={() => pick(day)}
                    className={cx(
                      "press grid size-11 place-items-center rounded-full text-[17px] tnum disabled:opacity-30",
                      day === picked
                        ? "bg-accent font-semibold text-accent-ink"
                        : day === today
                          ? "font-semibold text-accent"
                          : "text-ink hover:bg-[var(--hover)]",
                    )}
                  >
                    {Number(day.slice(8))}
                  </button>
                ) : (
                  <span key={`blank-${i}`} className="size-11" />
                ),
              )}
            </div>
          </div>
        </div>
      </Sheet>
    </>
  );
}
