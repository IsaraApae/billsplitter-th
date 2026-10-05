"use client";

import { AlertTriangle, Check, CheckCircle2, Info, Minus, Plus, X, XCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { currencyExponent, currencySymbol, parseMoney, toMajorString } from "@/lib/money";
import type { Person, PersonColor } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** One line-icon set everywhere: 2px stroke, round caps and joins. */
export const ICON = { strokeWidth: 2 } as const;

// ---------- Money ------------------------------------------------------------

/**
 * Money with a smaller symbol and decimals, tabular digits. `tone="signed"`
 * colours negative amounts (muted red) and positive ones (muted green).
 */
export function Money({
  value,
  currency,
  className,
  tone,
}: {
  value: number;
  currency: string;
  className?: string;
  tone?: "signed" | "negative";
}) {
  const exp = currencyExponent(currency);
  const abs = Math.abs(value) / 10 ** exp;
  const [whole, frac] = abs.toFixed(exp).split(".");
  const grouped = Number(whole).toLocaleString("en-US");
  const color =
    tone === "negative" || (tone === "signed" && value < 0) ? "text-danger" : tone === "signed" && value > 0 ? "text-positive" : "";
  return (
    <span className={cx("tnum whitespace-nowrap", color, className)}>
      {(value < 0 || tone === "negative") && value !== 0 && "−"}
      <span className="mr-[0.08em] align-[0.28em] text-[0.62em] font-semibold opacity-80">{currencySymbol(currency)}</span>
      {grouped}
      {frac !== undefined && <span className="text-[0.62em] opacity-80">.{frac}</span>}
    </span>
  );
}

// ---------- People ------------------------------------------------------------

/** Soft, muted tag colours for people (never neon). */
export const COLOR_HEX: Record<PersonColor, string> = {
  emerald: "#93C79C",
  sky: "#86B2DE",
  violet: "#9F9DDA",
  rose: "#E39AB4",
  amber: "#E8AC72",
  teal: "#7FC4BD",
  indigo: "#92C1D1",
  slate: "#A9A9B0",
};

export function Avatar({
  person,
  size = 32,
  className,
}: {
  person: Pick<Person, "name" | "emoji" | "color">;
  size?: number;
  className?: string;
}) {
  const hex = COLOR_HEX[person.color ?? "slate"];
  const initial = [...(person.name.trim() || "?")][0].toUpperCase();
  return (
    <span
      aria-hidden
      className={cx("inline-grid shrink-0 place-items-center rounded-full font-semibold text-[#1c1c1e]", className)}
      style={{ width: size, height: size, fontSize: person.emoji ? size * 0.55 : size * 0.42, background: hex }}
    >
      {person.emoji || initial}
    </span>
  );
}

// ---------- Controls ------------------------------------------------------------

/** Switch: a wide capsule with a capsule-shaped white thumb; accent green when on. */
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
        <span className="block text-[17px] text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative h-[30px] w-[60px] shrink-0 rounded-full bg-[var(--field)] peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:top-[2px] after:left-[2px] after:h-[26px] after:w-[34px] after:rounded-full after:bg-white after:shadow-[0_3px_8px_rgb(0_0_0/0.18),0_1px_1px_rgb(0_0_0/0.06)] peer-checked:after:left-[24px]"
      />
    </label>
  );
}

/** Segmented control: glass capsule track, the selected segment is a brighter glass pill. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  flat = false,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  /** on a card: no blur */
  flat?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx("grid auto-cols-fr grid-flow-col gap-1 rounded-full p-1", flat ? "bg-[var(--field)]" : "glass")}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "press min-h-10 rounded-full px-3 text-[15px]",
              on
                ? "bg-[var(--glass-strong)] font-semibold text-ink shadow-[0_3px_10px_-2px_rgb(0_0_0/0.15),inset_0_0.5px_0_var(--glass-highlight)]"
                : "font-medium text-ink-2",
            )}
          >
            {o.label}
          </button>
        );
      })}
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
  const parsed = parseMoney(text, currency, allowNegative);
  const invalid = text.trim() !== "" && parsed === null;
  return (
    <div className={cx("relative", className)}>
      <span className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-ink-2">{currencySymbol(currency)}</span>
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        placeholder={placeholder}
        className={cx("input tnum pl-10 text-right", (invalid || (parsed ?? 0) < 0) && "text-danger")}
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
    <div className="relative w-24 shrink-0">
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        className="input tnum pr-10 text-right"
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(",", ".");
          setText(t);
          const n = Number(t);
          if (t.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= max) onChange(Math.round(n * 100));
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-5 -translate-y-1/2 text-ink-2">%</span>
    </div>
  );
}

export function QtyStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center rounded-full bg-[var(--field)]">
      <button
        type="button"
        aria-label="Decrease quantity"
        className="icon-plain disabled:opacity-30"
        disabled={value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        <Minus size={20} {...ICON} />
      </button>
      <span className="tnum w-7 text-center font-semibold" aria-label="Quantity">
        {value}
      </span>
      <button type="button" aria-label="Increase quantity" className="icon-plain" onClick={() => onChange(Math.min(999, value + 1))}>
        <Plus size={20} {...ICON} />
      </button>
    </div>
  );
}

/** Inline note. Text stays in the main text colour (contrast-safe); the icon carries the tone. */
export function Callout({
  tone = "info",
  icon,
  children,
}: {
  tone?: "info" | "warn" | "error" | "success";
  icon?: ReactNode;
  children: ReactNode;
}) {
  const bg = { info: "bg-info-soft", warn: "bg-warn-soft", error: "bg-danger-soft", success: "bg-accent-soft" }[tone];
  const iconColor = { info: "text-info", warn: "text-warn", error: "text-danger", success: "text-accent" }[tone];
  const Default = { info: Info, warn: AlertTriangle, error: XCircle, success: CheckCircle2 }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-3 rounded-[22px] px-4 py-3.5 text-[15px] leading-snug text-ink", bg)}>
      <span className={cx("mt-px shrink-0", iconColor)} aria-hidden>
        {icon ?? <Default size={20} {...ICON} />}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** A 13px secondary label sitting above a card, with an optional action on the right. */
export function Section({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex min-h-8 items-end justify-between gap-2 px-5">
        <h2 className="text-[13px] text-ink-2">{title}</h2>
        {action}
      </div>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

// ---------- Bottom sheet ------------------------------------------------------

/**
 * Glass sheet on a native <dialog> (focus trap, Esc, inert background for
 * free). Slides up; close circle at top left, optional filled confirm circle
 * at top right. Swipe the handle down or tap outside to close.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  onConfirm,
  confirmForm,
  confirmLabel = "Done",
  confirmDisabled,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  onConfirm?: () => void;
  /** id of a <form> inside the sheet: the confirm circle submits it. */
  confirmForm?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
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
    if (open && !d.open) {
      d.showModal();
      // showModal focuses the close circle, which would show its focus ring on
      // every open; start on the sheet itself instead (Tab still reaches it).
      d.focus();
    }
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
      tabIndex={-1}
      className="sheet panel"
      style={dy ? { transform: `translateY(${dy}px)` } : undefined}
      onClose={() => openRef.current && onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[inherit] flex-col">
        <div
          className="flex cursor-grab touch-none justify-center pt-2 pb-1"
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
          <span aria-hidden className="h-[5px] w-9 rounded-full bg-[var(--line)]" />
        </div>
        <header className="grid grid-cols-[44px_1fr_44px] items-center gap-2 px-4 pb-3">
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={22} {...ICON} />
          </button>
          <div className="min-w-0 text-center">
            <h2 id={titleId} className="truncate text-[17px] font-semibold">
              {title}
            </h2>
            {subtitle && <p className="truncate text-[13px] text-ink-2">{subtitle}</p>}
          </div>
          {onConfirm || confirmForm ? (
            <button
              type={confirmForm ? "submit" : "button"}
              form={confirmForm}
              className="press inline-grid size-11 place-items-center rounded-full bg-accent text-accent-ink disabled:opacity-40"
              aria-label={confirmLabel}
              disabled={confirmDisabled}
              onClick={onConfirm}
            >
              <Check size={22} {...ICON} />
            </button>
          ) : (
            <span />
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          {open && children}
        </div>
      </div>
    </dialog>
  );
}
