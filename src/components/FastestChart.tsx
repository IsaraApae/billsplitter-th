"use client";

import { useEffect, useRef, useState } from "react";
import { duration } from "@/lib/owed";

export interface ChartBill {
  title: string;
  /** the bill's day, YYYY-MM-DD */
  day: string;
}
export interface ChartLine {
  name: string;
  /** place in the ranking, 1 = fastest */
  place: number;
  /** their average time to pay after each bill (ms); null before their first bill */
  vals: (number | null)[];
}

/** Line colours by place: the podium's, deep enough to read as lines; everyone else dashed grey. */
const STROKE = ["#D19A00", "#7D8A97", "#C0662A", "#27A873", "#3A86D0"];
const strokeOf = (place: number) => STROKE[place - 1] ?? "var(--ink-3)";

const M = 60_000;
const H = 60 * M;
const D = 24 * H;
const STEPS = [5 * M, 10 * M, 15 * M, 30 * M, H, 2 * H, 3 * H, 6 * H, 12 * H, D, 2 * D, 3 * D, 5 * D, 7 * D, 14 * D, 30 * D];
/** A round top for the axis, about four gridlines. */
function scale(max: number) {
  const step = STEPS.find((s) => s >= max / 4) ?? Math.ceil(max / 4 / (30 * D)) * 30 * D;
  return { top: Math.max(step, Math.ceil(max / step) * step), step };
}
const tick = (v: number) => (v === 0 ? "0" : v % D === 0 ? `${v / D}d` : v % H === 0 ? `${v / H}h` : `${Math.round(v / M)}m`);
const shortDay = (day: string) => new Date(`${day}T12:00:00+07:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

/**
 * "Average through the bills", like a season's points chart: bills along the bottom in the
 * order they started, and each friend's average time to pay after each one (lower is
 * faster), so their line ends where the ranking puts them. The fastest gets a filled line;
 * tap or hover a bill for everyone's average there.
 */
export function FastestChart({ bills, lines }: { bills: ChartBill[]; lines: ChartLine[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = bills.length;
  const h = w < 520 ? 210 : 250;
  const L = 36, R = 64, T = 12, B = 24;
  const all = lines.flatMap((l) => l.vals.filter((v): v is number => v !== null));
  const { top, step } = scale(Math.max(H, ...all));
  const x = (i: number) => L + (i * (w - L - R)) / Math.max(1, n - 1);
  const y = (v: number) => T + (1 - v / top) * (h - T - B);
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((w - L - R) / 26))));
  const path = (l: ChartLine) =>
    l.vals
      .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .reduce<string>((d, p) => (p === null ? d : `${d}${d ? "L" : "M"}${p}`), "");
  // Slowest first, so the faster lines sit on top.
  const drawn = [...lines].sort((a, b) => b.place - a.place);
  const first = lines.find((l) => l.place === 1);
  const firstStart = first ? first.vals.findIndex((v) => v !== null) : -1;

  // Name labels at the line ends, pushed apart when lines finish close together.
  const ends = lines
    .filter((l) => l.vals[n - 1] !== null)
    .map((l) => ({ l, y: y(l.vals[n - 1]!) }))
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + 13);
  const over = ends.length ? ends[ends.length - 1].y - (h - B) : 0;
  if (over > 0) for (const e of ends) e.y -= over;

  function pick(clientX: number) {
    const el = box.current;
    if (!el || n < 2) return;
    const px = clientX - el.getBoundingClientRect().left;
    let i = 0;
    for (let k = 0; k < n; k++) if (Math.abs(x(k) - px) < Math.abs(x(i) - px)) i = k;
    setAt(i);
  }
  const tipRows = at === null ? [] : lines.filter((l) => l.vals[at] !== null).sort((a, b) => a.vals[at]! - b.vals[at]!);
  const tipW = 180;

  return (
    <div
      ref={box}
      className="relative min-h-[120px] touch-pan-y select-none"
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setAt(null)}
    >
      {w > 0 && (
        <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Average time to pay after each bill">
          <defs>
            <linearGradient id="fastest-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={STROKE[0]} stopOpacity={0.26} />
              <stop offset="1" stopColor={STROKE[0]} stopOpacity={0} />
            </linearGradient>
          </defs>
          {Array.from({ length: Math.floor(top / step) + 1 }, (_, k) => k * step).map((v) => (
            <g key={v}>
              <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={L - 6} y={y(v) + 3.5} textAnchor="end" className="fill-ink-2 text-[10.5px] font-bold">
                {tick(v)}
              </text>
            </g>
          ))}
          {bills.map((_, i) =>
            (n - 1 - i) % every === 0 ? (
              <text key={i} x={x(i)} y={h - 6} textAnchor="middle" className="fill-ink-2 text-[10.5px] font-bold">
                {i + 1}
              </text>
            ) : null,
          )}
          {at !== null && <line x1={x(at)} x2={x(at)} y1={T} y2={h - B} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />}
          {first && firstStart >= 0 && (
            <path d={`${path(first)}L${x(n - 1)},${y(0)}L${x(firstStart)},${y(0)}Z`} fill="url(#fastest-fill)" />
          )}
          {drawn.map((l) => {
            const last = l.vals[n - 1];
            const podium = l.place <= 5;
            return (
              <g key={l.name + l.place}>
                <path
                  d={path(l)}
                  fill="none"
                  stroke={strokeOf(l.place)}
                  strokeWidth={l.place === 1 ? 2.8 : podium ? 2 : 1.6}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={podium ? undefined : "4 4"}
                  opacity={podium ? 1 : 0.75}
                />
                {last !== null && <circle cx={x(n - 1)} cy={y(last)} r={l.place === 1 ? 4 : 3} fill={strokeOf(l.place)} />}
              </g>
            );
          })}
          {ends.map(({ l, y: ly }) => (
            <text key={l.name + l.place} x={x(n - 1) + 8} y={ly + 4} fill={strokeOf(l.place)} className="text-[11.5px] font-black">
              {l.name.length > 8 ? `${l.name.slice(0, 7)}…` : l.name}
            </text>
          ))}
        </svg>
      )}
      {at !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-[10px] border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 text-[12px] shadow-md"
          style={{ left: Math.min(Math.max(0, x(at) - tipW / 2), Math.max(0, w - tipW)), width: tipW }}
        >
          <b className="block truncate text-[10.5px] font-bold text-ink-2 uppercase">
            Bill {at + 1} · {bills[at].title} · {shortDay(bills[at].day)}
          </b>
          {tipRows.map((l) => (
            <span key={l.name + l.place} className="flex items-center gap-1.5">
              <i className="inline-block size-[9px] shrink-0 rounded-[3px]" style={{ background: strokeOf(l.place) }} />
              <span className="min-w-0 flex-1 truncate">{l.name}</span>
              <b className="tabular-nums">{duration(l.vals[at]!)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
