"use client";

import { Check, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBrowserValue } from "@/lib/client/hooks";
import { getDeviceKey, load } from "@/lib/client/storage";
import { langOf } from "@/lib/lang";
import type { Person } from "@/lib/types";
import { Avatar, Callout, ICON, Sheet, cx } from "./ui";

type Person5 = Pick<Person, "name" | "emoji" | "color"> & { key: string };
type Hidden = { key: string; name: string };
/** `from`: when it counts from on its own (ms); `start`: the organiser's own start, if set. */
type Bill = { id: string; title: string; day: string; from: number; start: string | null };

/** A moment as the value of a datetime-local field, in Thailand time ("2026-10-29T11:34"). */
const toField = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 16);
/** A datetime-local value (Thailand time) as a moment, or NaN. */
const fromField = (v: string) => Date.parse(`${v}:00+07:00`);

const norm = (s: string) => s.normalize("NFC").trim().toLocaleLowerCase();

/**
 * "Hide" on Who pays fastest: only on the phone this list belongs to. The organiser picks
 * friends to hide and bills not to count, for the ranking, the podium and its link preview.
 */
export function FastestHide({ id }: { id: string }) {
  const router = useRouter();
  const mine = useBrowserValue(() => load<string | null>("bs:board", null) === id, false);
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person5[] | null>(null);
  const [hidden, setHidden] = useState<Hidden[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [starts, setStarts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!mine) return null;

  async function start() {
    setOpen(true);
    setError(null);
    setPeople(null);
    try {
      const r = await fetch(`/api/boards/${id}/hidden`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: getDeviceKey() }),
      });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { people: Person5[]; hidden: Hidden[]; bills: Bill[]; skipped: string[] };
      // Someone hidden whose bills have all gone still shows, so they can be brought back.
      const gone = d.hidden.filter((h) => !d.people.some((p) => isHidden(p, [h]))).map((h) => ({ key: h.key, name: h.name }));
      setPeople([...d.people, ...gone].sort((a, b) => a.name.localeCompare(b.name, ["th", "en"], { sensitivity: "base" })));
      setHidden(d.hidden);
      setBills(d.bills);
      setStarts(Object.fromEntries(d.bills.flatMap((b) => (b.start ? [[b.id, b.start]] : []))));
      // A left-out bill that has since expired needn't be kept.
      setSkipped(d.skipped.filter((x) => d.bills.some((b) => b.id === x)));
    } catch {
      setError(navigator.onLine ? "Couldn't load your friends. Try again." : "You're offline. Try again when connected.");
    }
  }

  const isHidden = (p: Person5, list: Hidden[]) => list.some((h) => h.key === p.key || norm(h.name) === norm(p.name));
  const toggle = (p: Person5) =>
    setHidden((list) => (isHidden(p, list) ? list.filter((h) => !(h.key === p.key || norm(h.name) === norm(p.name))) : [...list, { key: p.key, name: p.name }]));

  const toggleBill = (billId: string) => setSkipped((list) => (list.includes(billId) ? list.filter((x) => x !== billId) : [...list, billId]));
  /** The organiser's own start for a bill; the bill's own start (or a cleared field) removes it. */
  const setStart = (b: Bill, value: string) =>
    setStarts((all) => {
      const t = fromField(value);
      const next = { ...all };
      if (!Number.isFinite(t) || Math.abs(t - b.from) < 60_000) delete next[b.id];
      else next[b.id] = new Date(t).toISOString();
      return next;
    });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/boards/${id}/hidden`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: getDeviceKey(), hidden, skipped, starts }),
      });
      if (!r.ok) throw new Error();
      setOpen(false);
      router.refresh();
    } catch {
      setError(navigator.onLine ? "Couldn't save. Try again." : "You're offline. Try again when connected.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-ghost min-h-10 gap-1.5 px-3 text-[15px]" onClick={start}>
        <EyeOff size={18} {...ICON} aria-hidden /> Hide
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="What counts in Who pays fastest"
        subtitle="Only you can change this"
        onConfirm={save}
        confirmLabel={busy ? "Saving…" : "Save"}
        confirmDisabled={busy || people === null}
      >
        <p className="mb-3 px-1 text-[15px] text-ink-2">
          Tick friends to hide them, or bills to stop counting them (say, one you ticked long after it was paid), or set when a bill really started. It changes the ranking, the podium and
          its link preview, for everyone who opens it.
        </p>
        {people && people.length > 0 && <h3 className="section-label mb-2 px-1">Friends</h3>}
        {error && <Callout tone="error">{error}</Callout>}
        {people === null && !error && <p className="px-1 text-ink-2">Loading…</p>}
        {people && people.length === 0 && <p className="card p-6 text-center text-ink-2">Nobody to rank yet.</p>}
        {people && people.length > 0 && (
          <ul className="card rows overflow-hidden" aria-label="Friends">
            {people.map((p) => {
              const off = isHidden(p, hidden);
              return (
                <li key={p.key}>
                  <label className="flex min-h-[56px] cursor-pointer items-center gap-3 py-2 pr-4 pl-4">
                    <Avatar person={p} size={36} />
                    <span className={cx("min-w-0 flex-1 truncate font-semibold", off && "text-ink-3 line-through")} {...langOf(p.name)}>
                      {p.name}
                    </span>
                    {off && <span className="text-[13px] text-ink-2">Hidden</span>}
                    <input type="checkbox" className="peer sr-only" checked={off} onChange={() => toggle(p)} aria-label={`Hide ${p.name}`} />
                    <span
                      aria-hidden
                      className={cx(
                        "grid size-7 shrink-0 place-items-center rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-accent",
                        off ? "bg-accent-fill text-accent-ink" : "bg-[var(--field)]",
                      )}
                    >
                      {off && <Check size={16} {...ICON} />}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {people && bills.length > 0 && (
          <>
            <h3 className="section-label mt-5 mb-2 px-1">Bills</h3>
            <ul className="card rows overflow-hidden" aria-label="Bills">
              {bills.map((b) => {
                const off = skipped.includes(b.id);
                return (
                  <li key={b.id} className="py-2 pr-4 pl-4">
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className={cx("block truncate font-semibold", off && "text-ink-3 line-through")} {...langOf(b.title)}>
                          {b.title}
                        </span>
                        <span className="block text-[13px] text-ink-2">
                          {new Date(`${b.day}T12:00:00+07:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" })}
                        </span>
                      </span>
                      {off && <span className="text-[13px] text-ink-2">Not counted</span>}
                      <input type="checkbox" className="peer sr-only" checked={off} onChange={() => toggleBill(b.id)} aria-label={`Don't count ${b.title}`} />
                      <span
                        aria-hidden
                        className={cx(
                          "grid size-7 shrink-0 place-items-center rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-accent",
                          off ? "bg-accent-fill text-accent-ink" : "bg-[var(--field)]",
                        )}
                      >
                        {off && <Check size={16} {...ICON} />}
                      </span>
                    </label>
                    {!off && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
                        <span id={`from-${b.id}`}>Counts from</span>
                        <input
                          type="datetime-local"
                          className="input min-h-9 w-auto px-2 text-[15px]"
                          aria-labelledby={`from-${b.id}`}
                          value={toField(starts[b.id] ? Date.parse(starts[b.id]) : b.from)}
                          onChange={(e) => setStart(b, e.target.value)}
                        />
                        {starts[b.id] ? (
                          <button type="button" className="font-semibold text-accent" onClick={() => setStart(b, toField(b.from))}>
                            Reset
                          </button>
                        ) : null}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 px-1 text-[13px] text-ink-2">
              Counts from: when the bill was shared, in Thailand time. Bills shared before 10 Nov 2026 never had that saved, so set the
              real time if you know it (say, from a slip).
            </p>
          </>
        )}
      </Sheet>
    </>
  );
}
