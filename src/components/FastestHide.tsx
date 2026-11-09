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
type Bill = { id: string; title: string; day: string };

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

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/boards/${id}/hidden`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: getDeviceKey(), hidden, skipped }),
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
        title="Leave out of Who pays fastest"
        subtitle="Only you can change this"
        onConfirm={save}
        confirmLabel={busy ? "Saving…" : "Save"}
        confirmDisabled={busy || people === null}
      >
        <p className="mb-3 px-1 text-[15px] text-ink-2">
          Tick friends to hide them, or bills to stop counting them (say, one you ticked long after it was paid). It changes the ranking, the podium and
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
                  <li key={b.id}>
                    <label className="flex min-h-[56px] cursor-pointer items-center gap-3 py-2 pr-4 pl-4">
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
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Sheet>
    </>
  );
}
