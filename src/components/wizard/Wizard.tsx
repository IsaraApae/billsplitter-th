"use client";

import { useEffect, useMemo, useState } from "react";
import { calculate } from "@/lib/calc";
import { getEditToken, load, remove, save, setEditToken, upsertHistory } from "@/lib/client/storage";
import { defaultTitle, newDoc } from "@/lib/draft";
import { formatMoney } from "@/lib/money";
import type { PaymentInfo, SplitDoc } from "@/lib/types";
import { Callout, cx } from "../ui";
import { ExtrasStep } from "./ExtrasStep";
import { ItemsStep } from "./ItemsStep";
import { PeopleStep } from "./PeopleStep";
import { ReviewStep } from "./ReviewStep";
import { ShareStep } from "./ShareStep";

const STEPS = ["Items", "People", "Extras", "Review", "Share"] as const;
const DRAFT_KEY = "bs:draft";
const PAYMENT_KEY = "bs:payment";

export interface DraftState {
  doc: SplitDoc;
  step: number;
  /** id of the shared split being edited (set after the first share) */
  editingId: string | null;
}

export type SetDoc = (fn: (d: SplitDoc) => SplitDoc) => void;

function freshState(): DraftState {
  return { doc: newDoc(load<PaymentInfo>(PAYMENT_KEY, { promptpay: "", note: "" })), step: 0, editingId: null };
}

/** Initial state from localStorage, or a request to load a shared split (?edit=id). */
function boot(): { draft: DraftState; editId: string | null; error: string | null } {
  const saved = load<DraftState | null>(DRAFT_KEY, null);
  const draft = saved?.doc?.v === 1 ? saved : freshState();
  const editId = new URLSearchParams(window.location.search).get("edit");
  if (!editId) return { draft, editId: null, error: null };
  if (!getEditToken(editId)) return { draft, editId: null, error: "You can only edit splits created on this device." };
  return { draft, editId, error: null };
}

export function Wizard() {
  const [init] = useState(boot);
  const [state, setState] = useState<DraftState | null>(init.editId ? null : init.draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(init.error);
  const loadingEdit = state === null;

  // Load a shared split for editing.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", "/");
    const { editId, draft } = init;
    if (!editId) return;
    fetch(`/api/splits/${editId}`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok || !data?.doc) throw new Error(data?.message ?? "Couldn't load that split.");
        setState({ doc: data.doc, step: 0, editingId: editId });
      })
      .catch((e: Error) => {
        setState(draft);
        setError(navigator.onLine ? e.message : "You're offline — couldn't load the split.");
      });
  }, [init]);

  useEffect(() => {
    if (state) save(DRAFT_KEY, state);
  }, [state]);

  const calc = useMemo(() => (state ? calculate(state.doc) : null), [state]);

  if (!state || !calc || loadingEdit) {
    return <div className="mx-auto max-w-2xl p-4 text-zinc-500">{loadingEdit ? "Loading split…" : ""}</div>;
  }

  const { doc, step } = state;
  const setDoc: SetDoc = (fn) => setState((s) => (s ? { ...s, doc: fn(s.doc) } : s));
  const go = (n: number) => {
    setError(null);
    setState((s) => (s ? { ...s, step: n } : s));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function startNew() {
    if (doc.items.length && step !== 4 && !confirm("Discard this draft and start a new split?")) return;
    remove(DRAFT_KEY);
    setError(null);
    setState(freshState());
  }

  async function finish() {
    if (!calc?.complete) return;
    setBusy(true);
    setError(null);
    const clean: SplitDoc = {
      ...doc,
      title: doc.title.trim() || defaultTitle(new Date(doc.createdAt)),
      people: doc.people.map((p, i) => ({ ...p, name: p.name.trim() || `Person ${i + 1}` })),
      items: doc.items.map((it, i) => ({ ...it, name: it.name.trim() || `Item ${i + 1}` })),
    };
    try {
      const editing = state!.editingId;
      const token = editing ? getEditToken(editing) : null;
      const res = await fetch(editing ? `/api/splits/${editing}` : "/api/splits", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "x-edit-token": token } : {}) },
        body: JSON.stringify(clean),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? `Saving failed (${res.status}).`);
      const id: string = editing ?? data.id;
      if (!editing) setEditToken(id, data.token);
      save(PAYMENT_KEY, clean.payment);
      const c = calculate(clean);
      upsertHistory({
        id,
        title: clean.title,
        createdAt: clean.createdAt,
        total: c.total,
        currency: clean.currency,
        people: clean.people.length,
        paid: 0,
      });
      setState({ doc: clean, step: 4, editingId: id });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(
        !navigator.onLine
          ? "You're offline. Your draft is saved — try again when you're connected."
          : (e as Error).message || "Saving failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const canNext = [doc.items.length > 0, doc.people.length > 0, true, calc.complete][step] ?? true;
  const nextHint = [
    "Add at least one item",
    "Add at least one person",
    "",
    doc.people.length === 0 ? "Add people first" : `${calc.unassignedItemIds.length} item(s) not assigned`,
  ][step];

  return (
    <div className="mx-auto max-w-2xl px-4 pt-3 pb-40">
      <nav aria-label="Steps" className="mb-5">
        <ol className="grid grid-cols-5 gap-1">
          {STEPS.map((label, i) => {
            const reachable = i < 4 ? true : state.editingId !== null && step === 4;
            return (
              <li key={label}>
                <button
                  type="button"
                  disabled={!reachable || i === step}
                  onClick={() => go(i)}
                  aria-current={i === step ? "step" : undefined}
                  className="flex min-h-11 w-full flex-col items-center gap-1 text-xs font-medium disabled:cursor-default"
                >
                  <span
                    className={cx(
                      "h-1.5 w-full rounded-full",
                      i <= step ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-800",
                    )}
                  />
                  <span className={i === step ? "text-zinc-900 dark:text-white" : "text-zinc-500"}>{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {state.editingId && step < 4 && (
        <div className="mb-4">
          <Callout tone="info">Editing a shared split — saving updates the same link.</Callout>
        </div>
      )}

      {step === 0 && <ItemsStep doc={doc} setDoc={setDoc} calc={calc} />}
      {step === 1 && <PeopleStep doc={doc} setDoc={setDoc} calc={calc} />}
      {step === 2 && <ExtrasStep doc={doc} setDoc={setDoc} calc={calc} />}
      {step === 3 && <ReviewStep doc={doc} setDoc={setDoc} calc={calc} goTo={go} />}
      {step === 4 && state.editingId && <ShareStep doc={doc} calc={calc} id={state.editingId} />}

      {/* Thumb-friendly bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-[var(--bg)]/95 backdrop-blur dark:border-zinc-800">
        <div className="mx-auto max-w-2xl px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error && (
            <div className="mb-2">
              <Callout tone="error">{error}</Callout>
            </div>
          )}
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-zinc-500">
              {!canNext && nextHint ? <span className="text-amber-600 dark:text-amber-400">{nextHint}</span> : "Grand total"}
            </span>
            <span className="text-lg font-bold tabular-nums">{formatMoney(calc.total, doc.currency)}</span>
          </div>
          <div className="flex gap-2">
            {step > 0 && step < 4 && (
              <button type="button" className="btn-secondary w-24" onClick={() => go(step - 1)}>
                Back
              </button>
            )}
            {step < 3 && (
              <button type="button" className="btn-primary flex-1" disabled={!canNext} onClick={() => go(step + 1)}>
                Next: {STEPS[step + 1]}
              </button>
            )}
            {step === 3 && (
              <button type="button" className="btn-primary flex-1" disabled={!canNext || busy} onClick={finish}>
                {busy ? "Saving…" : state.editingId ? "Save & share" : "Finish & share"}
              </button>
            )}
            {step === 4 && (
              <>
                <button type="button" className="btn-secondary flex-1" onClick={() => go(0)}>
                  Edit
                </button>
                <button type="button" className="btn-primary flex-1" onClick={startNew}>
                  New split
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {step < 4 && doc.items.length > 0 && (
        <div className="mt-10 text-center">
          <button type="button" className="btn-ghost text-sm" onClick={startNew}>
            Discard draft & start over
          </button>
        </div>
      )}
    </div>
  );
}
