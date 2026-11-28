"use client";

import { useEffect, useRef, useState } from "react";
import { duration } from "@/lib/owed";
import { cx } from "./ui";

export interface ChartDay {
  /** YYYY-MM-DD */
  day: string;
  /** that day's bills */
  titles: string[];
}
export interface ChartLine {
  name: string;
  /** place in the ranking now, 1 = fastest */
  place: number;
  /** their average time to pay at the end of each day (ms); null before their first bill */
  vals: (number | null)[];
  /** their place at the end of each day; null before their first bill */
  places: (number | null)[];
}

/**
 * Line colours by place: the podium's five (deep enough to read as lines), then a colour of
 * its own for everyone after, so 6th, 7th, 8th… can be told apart. Past 15th they repeat,
 * dashed. Each reads on the light and the dark background.
 */
const STROKE = [
  "#D19A00", "#7D8A97", "#C0662A", "#27A873", "#3A86D0", // gold, silver, bronze, mint, sky
  "#8E5BD0", "#D6559A", "#1E9BA8", "#D24C3F", "#5664D6", // purple, pink, teal, red, indigo
  "#7F8F1F", "#B0703A", "#3FA9E0", "#A64DB5", "#E07A1F", // olive, brown, cyan, plum, orange
];
const strokeOf = (place: number) => STROKE[(place - 1) % STROKE.length];
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const shortDay = (day: string) => new Date(`${day}T12:00:00+07:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

/**
 * "Place through time", like a season's positions chart: the days with bills along the
 * bottom, 1st at the top, and a line per friend showing where they ranked at the end of each
 * day (by average time to pay). Their line ends at today's place. Tap or hover a day for its
 * bills and everyone's place and average then.
 */
export function FastestChart({ days, lines }: { days: ChartDay[]; lines: ChartLine[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [at, setAt] = useState<number | null>(null);
  // A friend picked by their name: their line stands out, the rest fade.
  const [focus, setFocus] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = days.length;
  const people = lines.length;
  const places = lines.map((l) => l.places);
  // Room on the left for "1st" … "10th"+, so every place label sits on its own line.
  const L = people >= 10 ? 44 : 36, R = 64, T = 14, B = 30;
  // A row for each place.
  const h = T + B + Math.max(1, people - 1) * (people > 6 ? 24 : 32);
  const x = (i: number) => L + (i * (w - L - R)) / Math.max(1, n - 1);
  const y = (p: number) => (people === 1 ? (T + h - B) / 2 : T + ((p - 1) * (h - T - B)) / (people - 1));
  // Dates need about 44px each.
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((w - L - R) / 44))));
  const path = (k: number) =>
    places[k]
      .map((p, i) => (p === null ? null : `${x(i).toFixed(1)},${y(p).toFixed(1)}`))
      .reduce<string>((d, pt) => (pt === null ? d : `${d}${d ? "L" : "M"}${pt}`), "");
  // Slowest first, so the faster lines sit on top; a picked friend on top of all.
  const drawn = lines
    .map((l, k) => ({ l, k }))
    .sort((a, b) => Number(a.k === focus) - Number(b.k === focus) || b.l.place - a.l.place);
  const toggle = (k: number) => setFocus((f) => (f === k ? null : k));

  /** The day nearest a pointer, or null. */
  function dayAt(clientX: number): number | null {
    const el = box.current;
    if (!el || n < 2) return null;
    const px = clientX - el.getBoundingClientRect().left;
    let i = 0;
    for (let k = 0; k < n; k++) if (Math.abs(x(k) - px) < Math.abs(x(i) - px)) i = k;
    return i;
  }
  // A day whose box was just closed by tapping it again: moving over it doesn't reopen it.
  const closed = useRef<number | null>(null);
  const downX = useRef(0);
  /** A tap: open that day's box, or close it when it's the one already open. */
  function tap(clientX: number) {
    const i = dayAt(clientX);
    if (i === null) return;
    downX.current = clientX;
    if (i === at) {
      closed.current = i;
      setAt(null);
    } else {
      closed.current = null;
      setAt(i);
    }
  }
  /** Hovering with a mouse, or sliding a finger along: follow the pointer. */
  function follow(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" && (e.buttons === 0 || Math.abs(e.clientX - downX.current) < 8)) return;
    const i = dayAt(e.clientX);
    if (i === null || i === closed.current) return;
    closed.current = null;
    setAt(i);
  }
  const tipRows =
    at === null
      ? []
      : lines
          .map((l, k) => ({ l, p: places[k][at], v: l.vals[at] }))
          .filter((r): r is { l: ChartLine; p: number; v: number } => r.p !== null && r.v !== null)
          .sort((a, b) => a.p - b.p);
  // Wider with ten or more, so "10th" fits beside the name.
  const tipW = people >= 10 ? 212 : 196;

  return (
    <div
      ref={box}
      className="relative min-h-[120px] touch-pan-y select-none"
      onPointerMove={follow}
      onPointerDown={(e) => tap(e.clientX)}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        closed.current = null;
        setAt(null);
      }}
    >
      {w > 0 && (
        <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Each friend's place at the end of each day with a bill">
          {Array.from({ length: people }, (_, k) => k + 1).map((p) => (
            <g key={p}>
              <line x1={L} x2={w - R} y1={y(p)} y2={y(p)} stroke="var(--line)" strokeWidth={1} />
              <text x={L - 6} y={y(p) + 3.5} textAnchor="end" className="fill-ink-2 text-[10.5px] font-bold">
                {ordinal(p)}
              </text>
            </g>
          ))}
          {days.map((d, i) =>
            (n - 1 - i) % every === 0 ? (
              <text key={d.day} x={x(i)} y={h - 6} textAnchor="middle" className="fill-ink-2 text-[10.5px] font-bold">
                {shortDay(d.day)}
              </text>
            ) : null,
          )}
          {at !== null && <line x1={x(at)} x2={x(at)} y1={T - 6} y2={h - B + 6} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />}
          {drawn.map(({ l, k }) => {
            const podium = l.place <= 5;
            const repeat = l.place > STROKE.length; // colours come round again: dashed, to tell apart
            const last = places[k][n - 1];
            const faded = focus !== null && focus !== k;
            const picked = focus === k;
            return (
              <g key={l.name + l.place}>
                <g opacity={faded ? 0.15 : 1}>
                <path
                  d={path(k)}
                  fill="none"
                  stroke={strokeOf(l.place)}
                  strokeWidth={picked ? 4 : l.place === 1 ? 3 : podium ? 2.2 : 1.8}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={repeat ? "4 4" : undefined}
                />
                {/* A dot at each day, so a step reads as a day that changed things. */}
                {places[k].map((p, i) => (p === null || i === n - 1 ? null : <circle key={i} cx={x(i)} cy={y(p)} r={2.2} fill={strokeOf(l.place)} />))}
                {last !== null && <circle cx={x(n - 1)} cy={y(last)} r={l.place === 1 ? 4.5 : 3.5} fill={strokeOf(l.place)} />}
                </g>
                {last !== null && (
                  // Their name: tap to pick them out (again to show everyone).
                  <g
                    role="button"
                    tabIndex={0}
                    aria-pressed={picked}
                    aria-label={`${picked ? "Show everyone" : `Highlight ${l.name}`} in the chart`}
                    className="cursor-pointer outline-none"
                    // Faded names stay readable, so the next one can be picked.
                    opacity={faded ? 0.5 : 1}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => toggle(k)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(k);
                      }
                    }}
                  >
                    <rect x={x(n - 1) + 4} y={y(last) - 10} width={R - 4} height={20} fill="transparent" />
                    <text
                      x={x(n - 1) + 8}
                      y={y(last) + 4}
                      fill={strokeOf(l.place)}
                      className="text-[11.5px] font-black"
                      textDecoration={picked ? "underline" : undefined}
                    >
                      {l.name.length > 8 ? `${l.name.slice(0, 7)}…` : l.name}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {at !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-[10px] border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 text-[12px] shadow-md"
          style={{ left: Math.min(Math.max(0, x(at) - tipW / 2), Math.max(0, w - tipW)), width: tipW }}
        >
          <b className="block truncate text-[10.5px] font-bold text-ink-2 uppercase">
            {shortDay(days[at].day)} · {days[at].titles.join(", ")}
          </b>
          {tipRows.map(({ l, p, v }) => (
            <span key={l.name + l.place} className={cx("flex items-center gap-1.5", focus !== null && lines[focus] !== l && "opacity-40")}>
              <b className={cx("shrink-0 whitespace-nowrap tabular-nums", people >= 10 ? "w-9" : "w-7")}>{ordinal(p)}</b>
              <i className="inline-block size-[9px] shrink-0 rounded-[3px]" style={{ background: strokeOf(l.place) }} />
              <span className="min-w-0 flex-1 truncate">{l.name}</span>
              <span className="shrink-0 whitespace-nowrap text-ink-2 tabular-nums">{duration(v)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
