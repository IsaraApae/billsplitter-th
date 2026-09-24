"use client";

import { useState } from "react";
import type { CalcResult } from "@/lib/calc";
import { uid } from "@/lib/draft";
import { formatMoney } from "@/lib/money";
import type { SplitDoc } from "@/lib/types";
import { Callout, Section, Segmented, cx } from "../ui";
import type { SetDoc } from "./Wizard";

export function PeopleStep({ doc, setDoc, calc }: { doc: SplitDoc; setDoc: SetDoc; calc: CalcResult }) {
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
    setDoc((d) => ({
      ...d,
      people: [...d.people, ...names.map((n) => ({ id: uid(), name: n }))].slice(0, 50),
    }));
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
      <Section title="Who's splitting?">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(name);
          }}
        >
          <input
            className="input"
            placeholder="Name (or several, comma-separated)"
            aria-label="Person name"
            value={name}
            enterKeyHint="done"
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={!name.trim()}>
            Add
          </button>
        </form>

        {doc.people.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {["Me", "Me, Friend 1, Friend 2"].map((s) => (
              <button key={s} type="button" className="btn-secondary text-sm" onClick={() => add(s)}>
                + {s}
              </button>
            ))}
          </div>
        )}

        <ul className="flex flex-wrap gap-2" aria-label="People">
          {doc.people.map((p) => (
            <li key={p.id}>
              {editing === p.id ? (
                <input
                  autoFocus
                  className="input h-11 w-40 rounded-full"
                  aria-label={`Rename ${p.name}`}
                  value={p.name}
                  enterKeyHint="done"
                  onChange={(e) => rename(p.id, e.target.value)}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                />
              ) : (
                <span className="inline-flex h-11 items-center rounded-full border border-zinc-300 bg-white pl-4 dark:border-zinc-700 dark:bg-zinc-900">
                  <button
                    type="button"
                    className="h-full max-w-40 truncate font-medium"
                    onClick={() => setEditing(p.id)}
                    aria-label={`Rename ${p.name}`}
                  >
                    {p.name || "Unnamed"}
                  </button>
                  <button
                    type="button"
                    className="grid size-11 place-items-center rounded-full text-lg text-zinc-400 hover:text-red-600"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => removePerson(p.id)}
                  >
                    ×
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {doc.people.length > 0 && <p className="text-xs text-zinc-500">Tap a name to rename it.</p>}
      </Section>

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
        <div className="card p-4 text-center">
          <p className="text-sm text-zinc-500">Each of {doc.people.length} pays about</p>
          <p className="text-3xl font-bold tabular-nums">
            {formatMoney(Math.max(...calc.people.map((p) => p.total)), currency)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">incl. extras set on the next step</p>
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
                  "min-h-9 rounded-full px-3 text-sm font-semibold",
                  onlyUnassigned
                    ? "bg-amber-500 text-white"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
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
            <Callout tone="success">✓ Every item is assigned.</Callout>
          ) : null}
          {onlyUnassigned && unassigned.size === 0 && (
            <button type="button" className="btn-ghost text-sm" onClick={() => setOnlyUnassigned(false)}>
              Show all items
            </button>
          )}
          <ul className="space-y-2">
            {visibleItems.map((it) => {
              const line = calc.lines.find((l) => l.itemId === it.id);
              const missing = unassigned.has(it.id);
              const k = it.assigned.filter((a) => doc.people.some((p) => p.id === a)).length;
              const allOn = doc.people.length > 0 && k === doc.people.length;
              return (
                <li
                  key={it.id}
                  className={cx(
                    "card p-3",
                    missing && "border-amber-400 bg-amber-50/60 ring-1 ring-amber-400 dark:border-amber-600 dark:bg-amber-950/30 dark:ring-amber-600",
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {it.qty > 1 && <span className="text-zinc-500">{it.qty}× </span>}
                        {it.name || "Unnamed item"}
                      </p>
                      <p className="text-sm text-zinc-500 tabular-nums">
                        {formatMoney(line?.lineTotal ?? 0, currency)}
                        {k > 1 && ` · ÷${k} ≈ ${formatMoney(Math.round((line?.lineTotal ?? 0) / k), currency)} each`}
                      </p>
                    </div>
                    {missing && (
                      <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                        Unassigned
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      aria-pressed={allOn}
                      onClick={() => setAll(it.id, !allOn)}
                      className={cx(
                        "min-h-11 rounded-full border px-3 text-sm font-semibold",
                        allOn
                          ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                          : "border-dashed border-zinc-400 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300",
                      )}
                    >
                      {allOn ? "✓ Everyone" : "Select all"}
                    </button>
                    {doc.people.map((p) => {
                      const on = it.assigned.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(it.id, p.id)}
                          className={cx(
                            "min-h-11 max-w-40 truncate rounded-full border px-4 text-sm font-medium transition",
                            on
                              ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-zinc-950"
                              : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
                          )}
                        >
                          {on && "✓ "}
                          {p.name || "Unnamed"}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
