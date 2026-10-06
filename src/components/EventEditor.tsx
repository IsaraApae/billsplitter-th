"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { byBillDate, getEditToken, getHistory, setEditToken, upsertEvent, type EventEntry } from "@/lib/client/storage";
import { toDay } from "@/lib/draft";
import { DateField } from "./DateField";
import { Callout, ICON, Money, Sheet, cx } from "./ui";

/**
 * Create or edit a big bill: a title, a date and which of your splits it
 * contains (only splits this device can edit). Calls `onSaved` with the entry.
 */
export function EventEditor({
  open,
  onClose,
  event,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** the big bill being edited; omit to create one */
  event?: EventEntry;
  onSaved: (e: EventEntry) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={event ? "Edit big bill" : "New big bill"}
      subtitle="Several bills from one outing, paid as one"
      confirmForm="event-form"
      confirmLabel="Save"
    >
      {open && <EventForm event={event} onSaved={onSaved} />}
    </Sheet>
  );
}

function EventForm({ event, onSaved }: { event?: EventEntry; onSaved: (e: EventEntry) => void }) {
  // Your own splits, newest first.
  const [mine] = useState(() => byBillDate(getHistory()).filter((h) => getEditToken(h.id)));
  const [date, setDate] = useState(() => event?.date ?? (mine[0] ? toDay(new Date(mine[0].createdAt)) : toDay(new Date())));
  const [title, setTitle] = useState(event?.title ?? "");
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(event?.splitIds ?? mine.filter((h) => toDay(new Date(h.createdAt)) === date).map((h) => h.id)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function save() {
    if (picked.size === 0) {
      setError("Pick at least one bill.");
      return;
    }
    setBusy(true);
    setError(null);
    const splitIds = mine.filter((h) => picked.has(h.id)).map((h) => h.id);
    const fallback = `Night out · ${new Date(`${date}T12:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
    const body = {
      title: title.trim() || fallback,
      date,
      splits: splitIds.map((id) => ({ id, token: getEditToken(id) ?? undefined })),
    };
    try {
      const token = event ? getEditToken(event.id) : null;
      const res = await fetch(event ? `/api/events/${event.id}` : "/api/events", {
        method: event ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "x-edit-token": token } : {}) },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? `Saving failed (${res.status}).`);
      const id: string = event?.id ?? data.id;
      if (!event) setEditToken(id, data.token);
      const entry: EventEntry = { id, title: body.title, date, splitIds };
      upsertEvent(entry);
      onSaved(entry);
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : "You're offline — try again when connected.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      id="event-form"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void save();
      }}
    >
      <div className="card rows">
        <div className="px-5 py-3">
          <input
            className="w-full bg-transparent text-[20px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-3"
            placeholder="Title, e.g. Saturday night out"
            aria-label="Big bill title"
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="flex min-h-[56px] items-center justify-between gap-3 py-2 pr-3 pl-5">
          <span>Date</span>
          <DateField label="Big bill date" value={date} onChange={setDate} />
        </div>
      </div>

      <p className="px-5 text-[13px] text-ink-2">
        Bills in it · {picked.size} picked
      </p>
      {mine.length === 0 ? (
        <Callout tone="info">Share a split first — your shared splits can be combined here.</Callout>
      ) : (
        <ul className="card rows overflow-hidden" aria-label="Your bills">
          {mine.map((h) => {
            const on = picked.has(h.id);
            return (
              <li key={h.id}>
                <label className="flex min-h-[60px] cursor-pointer items-center gap-3 py-2 pr-4 pl-5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{h.title}</span>
                    <span className="block text-[13px] text-ink-2">
                      {new Date(h.createdAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                      {" · "}
                      <Money value={h.total} currency={h.currency} />
                    </span>
                  </span>
                  <input type="checkbox" className="peer sr-only" checked={on} onChange={() => toggle(h.id)} />
                  <span
                    aria-hidden
                    className={cx(
                      "grid size-7 shrink-0 place-items-center rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-accent",
                      on ? "bg-accent text-accent-ink" : "bg-[var(--field)]",
                    )}
                  >
                    {on && <Check size={16} {...ICON} />}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {error && <Callout tone="error">{error}</Callout>}
      {busy && (
        <p className="px-5 text-[13px] text-ink-2" aria-live="polite">
          Saving…
        </p>
      )}
    </form>
  );
}
