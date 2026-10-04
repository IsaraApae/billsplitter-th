"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { currencyExponent, currencySymbol, parseMoney, toMajorString } from "@/lib/money";
import type { Person, PersonColor } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ---------- Money ------------------------------------------------------------

/** Money with a smaller symbol and decimals, tabular digits. */
export function Money({ value, currency, className }: { value: number; currency: string; className?: string }) {
  const exp = currencyExponent(currency);
  const abs = Math.abs(value) / 10 ** exp;
  const [whole, frac] = abs.toFixed(exp).split(".");
  const grouped = Number(whole).toLocaleString("en-US");
  return (
    <span className={cx("tnum whitespace-nowrap", className)}>
      {value < 0 && "−"}
      <span className="mr-[0.08em] text-[0.62em] font-semibold align-[0.28em] opacity-80">{currencySymbol(currency)}</span>
      {grouped}
      {frac !== undefined && <span className="text-[0.62em] opacity-80">.{frac}</span>}
    </span>
  );
}

// ---------- People ------------------------------------------------------------

export const COLOR_HEX: Record<PersonColor, string> = {
  emerald: "#10b981",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  rose: "#f43f5e",
  amber: "#f59e0b",
  teal: "#14b8a6",
  indigo: "#6366f1",
  slate: "#64748b",
};

export function Avatar({ person, size = 32 }: { person: Pick<Person, "name" | "emoji" | "color">; size?: number }) {
  const hex = COLOR_HEX[person.color ?? "slate"];
  const initial = [...(person.name.trim() || "?")][0].toUpperCase();
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-ink"
      style={{
        width: size,
        height: size,
        fontSize: person.emoji ? size * 0.55 : size * 0.42,
        background: `color-mix(in srgb, ${hex} 24%, transparent)`,
        boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${hex} 55%, transparent)`,
      }}
    >
      {person.emoji || initial}
    </span>
  );
}

// ---------- Controls ------------------------------------------------------------

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
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{label}</span>
        {hint && <span className="block text-[13px] text-ink-3">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative h-[31px] w-[51px] shrink-0 rounded-full bg-[var(--field-border)] transition-colors duration-300 peer-checked:bg-accent peer-focus-visible:ring-4 peer-focus-visible:ring-accent/30 after:absolute after:top-[2px] after:left-[2px] after:size-[27px] after:rounded-full after:bg-white after:shadow-[0_3px_8px_rgb(0_0_0/0.2)] after:transition-transform after:duration-300 after:ease-spring peer-checked:after:translate-x-5 motion-reduce:after:transition-none"
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
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative grid auto-cols-fr grid-flow-col rounded-full bg-[var(--hover)] p-1 shadow-[inset_0_0_0_1px_var(--line)]"
    >
      <span
        aria-hidden
        className="glass-strong absolute top-1 bottom-1 left-1 rounded-full transition-transform duration-500 ease-spring motion-reduce:transition-none"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${i * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "relative z-10 min-h-10 rounded-full px-3 text-sm font-semibold transition-colors",
            value === o.value ? "text-ink" : "text-ink-2",
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
  allowNegative = false,
}: {
  value: number;
  currency: string;
  onChange: (minor: number) => void;
  className?: string;
  ariaLabel: string;
  placeholder?: string;
  /** e.g. a discount line on one item */
  allowNegative?: boolean;
}) {
  const fmt = (v: number) => (v ? (v < 0 ? "-" : "") + toMajorString(Math.abs(v), currency) : "");
  const [text, setText] = useState(fmt(value));
  // Re-sync when the value changes from outside, but not while the user types an equivalent value.
  const [seen, setSeen] = useState(`${value}|${currency}`);
  if (seen !== `${value}|${currency}`) {
    setSeen(`${value}|${currency}`);
    if ((parseMoney(text, currency, allowNegative) ?? 0) !== value) setText(fmt(value));
  }
  const invalid = text.trim() !== "" && parseMoney(text, currency, allowNegative) === null;
  return (
    <div className={cx("relative", className)}>
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3">
        {currencySymbol(currency)}
      </span>
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        placeholder={placeholder}
        className={cx("input tnum pl-9 text-right", invalid && "border-danger")}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseMoney(e.target.value, currency, allowNegative);
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
    <div className="relative w-28 shrink-0">
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        className="input tnum pr-9 text-right"
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(",", ".");
          setText(t);
          const n = Number(t);
          if (t.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= max) onChange(Math.round(n * 100));
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-3">%</span>
    </div>
  );
}

export function QtyStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center rounded-full bg-field shadow-[inset_0_0_0_1px_var(--field-border)]">
      <button
        type="button"
        aria-label="Decrease quantity"
        className="icon-btn text-lg disabled:opacity-30"
        disabled={value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        −
      </button>
      <span className="tnum w-6 text-center font-semibold" aria-label="Quantity">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        className="icon-btn text-lg"
        onClick={() => onChange(Math.min(999, value + 1))}
      >
        +
      </button>
    </div>
  );
}

export function Callout({
  tone = "info",
  icon,
  children,
}: {
  tone?: "info" | "warn" | "error" | "success";
  icon?: ReactNode;
  children: ReactNode;
}) {
  const styles = {
    info: "bg-info-soft text-info",
    warn: "bg-warn-soft text-warn",
    error: "bg-danger-soft text-danger",
    success: "bg-accent-soft text-accent-strong",
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("flex gap-2.5 rounded-2xl px-4 py-3 text-[14px] leading-snug font-medium", styles)}
    >
      {icon && <span className="mt-px shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex min-h-11 items-center justify-between gap-2 px-1">
        <h2 className="text-[20px] font-bold tracking-[-0.01em] text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ---------- Bottom sheet ------------------------------------------------------

/**
 * Bottom sheet on a native <dialog> (focus trap, Esc, inert background for
 * free). Slides up; swipe the handle down or tap outside to close.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const [dy, setDy] = useState(0);
  // The dialog's "close" event arrives asynchronously; only treat it as a user
  // dismissal while we still think the sheet is open (avoids races with a
  // sheet that was just reopened or swapped).
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    const root = document.documentElement;
    if (open) root.style.overflow = "hidden";
    return () => {
      root.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="sheet glass-strong"
      style={dy ? { transform: `translateY(${dy}px)`, transition: "none" } : undefined}
      onClose={() => openRef.current && onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[inherit] flex-col">
        <div
          className="flex cursor-grab touch-none justify-center pt-2.5 pb-1"
          onPointerDown={(e) => {
            drag.current = { y: e.clientY, dy: 0 };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            drag.current.dy = Math.max(0, e.clientY - drag.current.y);
            setDy(drag.current.dy);
          }}
          onPointerUp={() => {
            const moved = drag.current?.dy ?? 0;
            drag.current = null;
            setDy(0);
            if (moved > 90) onClose();
          }}
        >
          <span aria-hidden className="h-[5px] w-10 rounded-full bg-[var(--field-border)]" />
        </div>
        <header className="flex items-center gap-2 px-5 pb-2">
          <h2 id={titleId} className="min-w-0 flex-1 text-[20px] font-bold tracking-[-0.01em]">
            {title}
          </h2>
          <button type="button" className="icon-btn -mr-2" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{open && children}</div>
        {footer && open && (
          <div className="border-t border-line px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>
        )}
      </div>
    </dialog>
  );
}
