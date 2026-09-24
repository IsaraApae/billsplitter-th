"use client";

import { useState, type ReactNode } from "react";
import { currencySymbol, parseMoney, toMajorString } from "@/lib/money";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <span className="flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-sm text-zinc-500">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-zinc-300 transition peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/50 after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5 dark:bg-zinc-700 dark:peer-checked:bg-emerald-500"
      />
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-zinc-200/70 p-1 dark:bg-zinc-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "min-h-10 rounded-lg px-3 text-sm font-semibold transition",
            value === o.value
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white"
              : "text-zinc-600 dark:text-zinc-400",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Money input: shows major units, reports integer minor units. */
export function MoneyInput({
  value,
  currency,
  onChange,
  className,
  ariaLabel,
  placeholder = "0.00",
}: {
  value: number;
  currency: string;
  onChange: (minor: number) => void;
  className?: string;
  ariaLabel: string;
  placeholder?: string;
}) {
  const fmt = (v: number) => (v ? toMajorString(v, currency) : "");
  const [text, setText] = useState(fmt(value));
  // Re-sync when the value changes from outside, but not while the user types an equivalent value.
  const [seen, setSeen] = useState(`${value}|${currency}`);
  if (seen !== `${value}|${currency}`) {
    setSeen(`${value}|${currency}`);
    if ((parseMoney(text, currency) ?? 0) !== value) setText(fmt(value));
  }
  const invalid = text.trim() !== "" && parseMoney(text, currency) === null;
  return (
    <div className={cx("relative", className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400">
        {currencySymbol(currency)}
      </span>
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        placeholder={placeholder}
        className={cx("input pl-7 text-right tabular-nums", invalid && "border-red-500")}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseMoney(e.target.value, currency);
          if (v !== null) onChange(v);
          else if (e.target.value.trim() === "") onChange(0);
        }}
        onBlur={() => !invalid && setText(fmt(value))}
      />
    </div>
  );
}

/** Percent input in basis points. */
export function PercentInput({
  bp,
  onChange,
  ariaLabel,
  max = 100,
}: {
  bp: number;
  onChange: (bp: number) => void;
  ariaLabel: string;
  max?: number;
}) {
  const [text, setText] = useState(String(bp / 100));
  const [seen, setSeen] = useState(bp);
  if (seen !== bp) {
    setSeen(bp);
    if (Math.round(Number(text) * 100) !== bp) setText(String(bp / 100));
  }
  return (
    <div className="relative w-28">
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        className="input pr-8 text-right tabular-nums"
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(",", ".");
          setText(t);
          const n = Number(t);
          if (t.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= max) onChange(Math.round(n * 100));
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-zinc-400">%</span>
    </div>
  );
}

export function QtyStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center rounded-xl border border-zinc-300 dark:border-zinc-700">
      <button
        type="button"
        aria-label="Decrease quantity"
        className="grid size-11 place-items-center text-lg text-zinc-500 disabled:opacity-30"
        disabled={value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        −
      </button>
      <span className="w-6 text-center tabular-nums" aria-label="Quantity">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        className="grid size-11 place-items-center text-lg text-zinc-500"
        onClick={() => onChange(Math.min(999, value + 1))}
      >
        +
      </button>
    </div>
  );
}

export function Callout({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "error" | "success";
  children: ReactNode;
}) {
  const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100",
    warn: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100",
    error: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100",
    success:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl border px-3 py-2.5 text-sm", styles)}>
      {children}
    </div>
  );
}

export function Section({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
