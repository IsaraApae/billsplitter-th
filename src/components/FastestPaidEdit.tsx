"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBrowserValue } from "@/lib/client/hooks";
import { getDeviceKey, load } from "@/lib/client/storage";
import { duration, type PaidSource } from "@/lib/owed";
import { fromField, nowField, toField, when } from "@/lib/thaiTime";
import { Callout, ICON, Sheet } from "./ui";

const FROM_TEXT: Record<Exclude<PaidSource, "organiser">, string> = {
  slip: "the time on their slip",
  tick: "when they were ticked paid",
};

/**
 * On Who pays fastest, only on the phone the list belongs to: change when someone paid a bill
 * ("paid after …"), say from the organiser's bank statement. Their time counts over the tick
 * and any slip, for everyone; Reset goes back to those.
 */
export function FastestPaidEdit({
  id,
  bill,
  person,
  name,
  title,
  day,
  paidAt,
  from,
  source,
  auto,
}: {
  /** the list */
  id: string;
  bill: string;
  /** what the bill records their payment under */
  person: string;
  name: string;
  title: string;
  /** the bill's day, YYYY-MM-DD */
  day: string;
  paidAt: number;
  /** when the bill counts from */
  from: number;
  source: PaidSource;
  /** with the organiser's own time: what it would be without it */
  auto?: { at: number; source: Exclude<PaidSource, "organiser"> };
}) {
  const router = useRouter();
  const mine = useBrowserValue(() => load<string | null>("bs:board", null) === id, false);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  // The latest it can be: when the sheet was opened.
  const [latest, setLatest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!mine) return null;

  // The server takes a moment from the day before the bill's date (a transfer made late the night before).
  const earliest = Date.parse(`${day}T00:00:00+07:00`) - 86_400_000;
  const t = fromField(value);

  async function send(at: number | null) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/boards/${id}/paid-times`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: getDeviceKey(), times: [{ bill, person, at }] }),
      });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { changed: unknown[] };
      if (at !== null && d.changed.length === 0) {
        setError(`Couldn't change it: ${name} may no longer be ticked paid on this bill.`);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(navigator.onLine ? "Couldn't save. Try again." : "You're offline. Try again when connected.");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!Number.isFinite(t)) return setError("Pick a date and time.");
    if (t > fromField(latest) + 60_000) return setError("That time hasn't come yet. Pick an earlier one.");
    if (t < earliest) return setError(`Pick a time from ${when(earliest)} on.`);
    // Back to the slip or tick time: no time of their own needed.
    if (auto && Math.abs(t - auto.at) < 60_000) return void send(null);
    if (Math.abs(t - paidAt) < 60_000) return setOpen(false);
    void send(t);
  }

  return (
    <>
      <button
        type="button"
        className="btn-ghost -mr-2 grid h-8 w-10 place-items-center p-0 text-ink-2"
        aria-label={`Change when ${name} paid ${title}`}
        onClick={() => {
          setValue(toField(paidAt));
          setLatest(nowField());
          setError(null);
          setOpen(true);
        }}
      >
        <Pencil size={16} {...ICON} aria-hidden />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`When did ${name} pay?`}
        subtitle={title}
        onConfirm={save}
        confirmLabel={busy ? "Saving…" : "Save"}
        confirmDisabled={busy}
      >
        <div className="space-y-4">
          <div className="card space-y-3 p-5">
            <label className="block space-y-1.5">
              <span className="label">Paid at (Thailand time)</span>
              <input
                type="datetime-local"
                className="input"
                min={toField(earliest)}
                max={latest}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <p className="text-[15px] text-ink-2" aria-live="polite">
              {Number.isFinite(t) ? (
                <>
                  Paid after <b className="font-semibold text-ink">{duration(Math.max(0, t - from))}</b>
                </>
              ) : (
                " "
              )}
            </p>
          </div>
          <ul className="card rows overflow-hidden text-[15px]">
            <li className="flex justify-between gap-3 px-5 py-3">
              <span className="text-ink-2">Counts from</span>
              <span className="tnum">{when(from)}</span>
            </li>
            <li className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="text-ink-2">{source === "organiser" ? "Your time" : `From ${FROM_TEXT[source]}`}</span>
              <span className="tnum">{when(paidAt)}</span>
            </li>
            {source === "organiser" && auto && (
              <li className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0 text-ink-2">
                  Original, from {FROM_TEXT[auto.source]}: <span className="tnum text-ink">{when(auto.at)}</span>
                </span>
                <button type="button" className="shrink-0 font-semibold text-accent" disabled={busy} onClick={() => void send(null)}>
                  Reset
                </button>
              </li>
            )}
          </ul>
          {error && <Callout tone="error">{error}</Callout>}
        </div>
      </Sheet>
    </>
  );
}
