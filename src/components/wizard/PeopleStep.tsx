"use client";

import { Check, Rows3, SlidersHorizontal, UserPlus, UsersRound, X } from "lucide-react";
import { useState } from "react";
import type { CalcResult } from "@/lib/calc";
import { ensureFriend } from "@/lib/client/friendsStore";
import { MAX_SPLIT_QTY, splitItem } from "@/lib/draft";
import { ME_ID } from "@/lib/friends";
import type { SplitDoc } from "@/lib/types";
import { Avatar, Callout, ICON, Money, QtyStepper, Section, Segmented, Sheet, cx } from "../ui";
import type { SetDoc } from "./Wizard";

export function PeopleStep({
  doc,
  setDoc,
  calc,
  onPickFriends,
}: {
  doc: SplitDoc;
  setDoc: SetDoc;
  calc: CalcResult;
  onPickFriends: () => void;
}) {
  // Item whose uneven shares are being edited.
  const [sharesFor, setSharesFor] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const currency = doc.currency;
  const unassigned = new Set(calc.unassignedItemIds);

  function add(raw: string) {
    const names = raw
      .split(/[,\n]/)
      .map((s) => s.trim().slice(0, 40))
      .filter(Boolean);
    if (!names.length) return;
    // Typed names are saved to Friends too (no duplicates by name).
    const friends = names.map((n) => ensureFriend({ name: n }));
    setDoc((d) => {
      const have = new Set(d.people.map((p) => p.id));
      const fresh = friends
        .filter((f) => !have.has(f.id))
        .map((f) => ({ id: f.id, name: f.name, emoji: f.emoji, color: f.color }));
      return { ...d, people: [...d.people, ...fresh].slice(0, 50) };
    });
    setName("");
  }

  const rename = (id: string, n: string) =>
    setDoc((d) => ({ ...d, people: d.people.map((p) => (p.id === id ? { ...p, name: n.slice(0, 40) } : p)) }));

  const removePerson = (id: string) =>
    setDoc((d) => ({
      ...d,
      people: d.people.filter((p) => p.id !== id),
      items: d.items.map((it) => ({ ...it, assigned: it.assigned.filter((a) => a !== id) })),
    }));

  const toggle = (itemId: string, personId: string) =>
    setDoc((d) => ({
      ...d,
      items: d.items.map((it) =>
        it.id !== itemId
          ? it
          : {
              ...it,
              assigned: it.assigned.includes(personId)
                ? it.assigned.filter((a) => a !== personId)
                : [...it.assigned, personId],
            },
      ),
    }));

  const setAll = (itemId: string, all: boolean) =>
    setDoc((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === itemId ? { ...it, assigned: all ? d.people.map((p) => p.id) : [] } : it)),
    }));

  const visibleItems = doc.items.filter((it) => !onlyUnassigned || unassigned.has(it.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="large-title">Who&apos;s splitting?</h1>
        <p className="mt-1 text-ink-2">Tap a name to rename it for this split.</p>
      </div>

      <div className="card space-y-4 p-5">
        <ul className="flex flex-wrap gap-2" aria-label="People">
          {doc.people.map((p) => (
            <li key={p.id}>
              {editing === p.id ? (
                <input
                  autoFocus
                  className="input h-11 min-h-11 w-44 rounded-full"
                  aria-label={`Rename ${p.name}`}
                  value={p.name}
                  enterKeyHint="done"
                  onChange={(e) => rename(p.id, e.target.value)}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                />
              ) : (
                <span className="glass-flat inline-flex h-11 items-center rounded-full pl-1.5">
                  <button
                    type="button"
                    className="flex h-full max-w-44 items-center gap-2 pr-1 font-semibold"
                    onClick={() => setEditing(p.id)}
                    aria-label={`Rename ${p.name}`}
                  >
                    <Avatar person={p} size={32} />
                    <span className="truncate">{p.name || "Unnamed"}</span>
                    {p.id === ME_ID && <span className="text-[12px] font-medium text-ink-2">you</span>}
                  </button>
                  <button
                    type="button"
                    className="icon-plain size-10"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => removePerson(p.id)}
                  >
                    <X size={18} {...ICON} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(name);
          }}
        >
          <input
            className="input"
            placeholder="Add a name (or several, comma-separated)"
            aria-label="Person name"
            value={name}
            enterKeyHint="done"
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn-secondary w-12 shrink-0 px-0" disabled={!name.trim()} aria-label="Add person">
            <UserPlus size={22} {...ICON} />
          </button>
        </form>
        <button type="button" className="btn-secondary h-12 w-full" onClick={onPickFriends}>
          <UsersRound size={22} {...ICON} aria-hidden /> Pick from Friends
        </button>
      </div>

      <Section title="How to split">
        <Segmented
          label="Split mode"
          value={doc.mode}
          onChange={(mode) => setDoc((d) => ({ ...d, mode }))}
          options={[
            { value: "equal", label: "Split equally" },
            { value: "itemized", label: "By item" },
          ]}
        />
      </Section>

      {doc.mode === "equal" && doc.people.length > 0 && (
        <div className="card p-6 text-center">
          <p className="text-[15px] text-ink-2">Each of {doc.people.length} pays about</p>
          <Money
            value={Math.max(...calc.people.map((p) => p.payable))}
            currency={currency}
            className="mt-1 block text-[44px] leading-none font-bold tracking-tight"
          />
          <p className="mt-2 text-[13px] text-ink-2">incl. extras set on the next step</p>
        </div>
      )}

      {doc.mode === "itemized" && (
        <Section
          title="Who had what?"
          action={
            unassigned.size > 0 && (
              <button
                type="button"
                className={cx(
                  "press min-h-8 rounded-full px-3 text-[13px] font-semibold",
                  onlyUnassigned ? "bg-ink text-[var(--bg)]" : "bg-warn-soft text-ink",
                )}
                aria-pressed={onlyUnassigned}
                onClick={() => setOnlyUnassigned((v) => !v)}
              >
                {unassigned.size} unassigned
              </button>
            )
          }
        >
          {doc.people.length === 0 ? (
            <Callout tone="info">Add people above, then tap names on each item.</Callout>
          ) : unassigned.size === 0 ? (
            <Callout tone="success">
              Every item is assigned.
            </Callout>
          ) : null}
          {onlyUnassigned && unassigned.size === 0 && (
            <button type="button" className="btn-ghost text-[15px]" onClick={() => setOnlyUnassigned(false)}>
              Show all items
            </button>
          )}
          <ul className="card rows overflow-hidden">
            {visibleItems.map((it) => {
              const line = calc.lines.find((l) => l.itemId === it.id);
              const missing = unassigned.has(it.id);
              const who = doc.people.filter((p) => it.assigned.includes(p.id));
              const k = who.length;
              const uneven = who.some((p) => (it.shares?.[p.id] ?? 1) > 1);
              const allOn = doc.people.length > 0 && k === doc.people.length;
              return (
                <li key={it.id} className={cx("px-5 py-4", missing && "bg-warn-soft")}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {it.qty > 1 && <span className="text-ink-2">{it.qty}× </span>}
                        {it.name || "Unnamed item"}
                      </p>
                      <p className="text-[13px] text-ink-2">
                        <Money value={line?.lineTotal ?? 0} currency={currency} tone={(line?.lineTotal ?? 0) < 0 ? "negative" : undefined} />
                        {k > 1 && !uneven && (
                          <>
                            {" "}
                            · ÷{k} ≈ <Money value={Math.round((line?.lineTotal ?? 0) / k)} currency={currency} /> each
                          </>
                        )}
                        {k > 1 && uneven && <> · {who.map((p) => `${p.name} ${it.shares?.[p.id] ?? 1}`).join(" · ")}</>}
                      </p>
                    </div>
                    {missing && <span className="shrink-0 pt-0.5 text-[13px] font-semibold text-warn">Unassigned</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" aria-pressed={allOn} onClick={() => setAll(it.id, !allOn)} className={allOn ? "chip-on" : "chip"}>
                      {allOn && <Check size={18} {...ICON} aria-hidden />}
                      {allOn ? "Everyone" : "Select all"}
                    </button>
                    {doc.people.map((p) => {
                      const on = it.assigned.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(it.id, p.id)}
                          className={cx(on ? "chip-accent" : "chip", "max-w-44 pl-1.5")}
                        >
                          <Avatar person={p} size={30} />
                          <span className="truncate">{p.name || "Unnamed"}</span>
                        </button>
                      );
                    })}
                  </div>
                  {(k > 1 || (it.qty > 1 && it.qty <= MAX_SPLIT_QTY)) && (
                    <div className="mt-1 flex flex-wrap gap-x-5">
                      {it.qty > 1 && it.qty <= MAX_SPLIT_QTY && (
                        <button
                          type="button"
                          className="btn-ghost min-h-11 px-0 text-[15px]"
                          onClick={() => setDoc((d) => splitItem(d, it.id))}
                        >
                          <Rows3 size={18} {...ICON} aria-hidden /> Split into {it.qty} items
                        </button>
                      )}
                      {k > 1 && (
                        <button type="button" className="btn-ghost min-h-11 px-0 text-[15px]" onClick={() => setSharesFor(it.id)}>
                          <SlidersHorizontal size={18} {...ICON} aria-hidden /> {uneven ? "Change shares" : "Split unevenly"}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <SharesSheet doc={doc} setDoc={setDoc} calc={calc} itemId={sharesFor} onClose={() => setSharesFor(null)} />
    </div>
  );
}

/** "Mint had 2 of the 3 beers": how many shares each person had of one item. */
function SharesSheet({
  doc,
  setDoc,
  calc,
  itemId,
  onClose,
}: {
  doc: SplitDoc;
  setDoc: SetDoc;
  calc: CalcResult;
  itemId: string | null;
  onClose: () => void;
}) {
  const it = doc.items.find((x) => x.id === itemId);
  const who = it ? doc.people.filter((p) => it.assigned.includes(p.id)) : [];
  const setShares = (pid: string, n: number) =>
    setDoc((d) => ({
      ...d,
      items: d.items.map((x) => {
        if (x.id !== itemId) return x;
        const shares = Object.fromEntries(Object.entries({ ...x.shares, [pid]: n }).filter(([, v]) => v > 1));
        return { ...x, shares: Object.keys(shares).length ? shares : undefined };
      }),
    }));

  return (
    <Sheet
      open={!!it}
      onClose={onClose}
      onConfirm={onClose}
      title={it ? `${it.qty > 1 ? `${it.qty}× ` : ""}${it.name || "Unnamed item"}` : ""}
      subtitle="How many shares each person had"
    >
      {it && (
        <div className="space-y-3.5">
          <ul className="card rows overflow-hidden">
            {who.map((p) => {
              const share = calc.people.find((r) => r.personId === p.id)?.items.find((x) => x.itemId === it.id);
              return (
                <li key={p.id} className="flex min-h-[60px] items-center gap-3 py-2 pr-3 pl-5">
                  <Avatar person={p} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name || "Unnamed"}</span>
                    {share && <Money value={share.amount} currency={doc.currency} className="text-[13px] text-ink-2" />}
                  </span>
                  <QtyStepper label={`${p.name}'s shares`} value={it.shares?.[p.id] ?? 1} onChange={(n) => setShares(p.id, n)} />
                </li>
              );
            })}
          </ul>
          <p className="px-5 text-[13px] text-ink-2">
            {it.qty > 1
              ? `E.g. if one person had 2 of the ${it.qty} and another had 1, give them 2 and 1.`
              : "E.g. give someone 2 to make their part twice as big as everyone else's."}
          </p>
          {who.some((p) => (it.shares?.[p.id] ?? 1) > 1) && (
            <button
              type="button"
              className="btn-secondary h-12 w-full"
              onClick={() => setDoc((d) => ({ ...d, items: d.items.map((x) => (x.id === itemId ? { ...x, shares: undefined } : x)) }))}
            >
              Split evenly
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
