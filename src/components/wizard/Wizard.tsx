"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { calculate } from "@/lib/calc";
import { rememberPeople } from "@/lib/client/friendsStore";
import { askConfirm } from "@/lib/client/confirm";
import { hasPendingScan, SCAN_EVENT } from "@/lib/client/pendingScan";
import { getProfile, paymentFromProfile } from "@/lib/client/profile";
import {
  getEditToken,
  historyFromDoc,
  load,
  paidProgress,
  remove,
  save,
  setEditToken,
  upsertHistory,
} from "@/lib/client/storage";
import { billDate, defaultTitle, newDoc, toDay } from "@/lib/draft";
import { toPeople } from "@/lib/friends";
import type { Person, SplitDoc } from "@/lib/types";
import { CrewSheet } from "../CrewSheet";
import { Callout, ICON, Money, cx } from "../ui";
import { ExtrasStep } from "./ExtrasStep";
import { ItemsStep } from "./ItemsStep";
import { PeopleStep } from "./PeopleStep";
import { ReviewStep } from "./ReviewStep";
import { ShareStep } from "./ShareStep";

const STEPS = ["Items", "People", "Extras", "Review", "Share"] as const;
const DRAFT_KEY = "bs:draft";

export interface DraftState {
  doc: SplitDoc;
  step: number;
  /** id of the shared split being edited (set after the first share) */
  editingId: string | null;
}

export type SetDoc = (fn: (d: SplitDoc) => SplitDoc) => void;

function freshState(): DraftState {
  const profile = getProfile();
  const doc = newDoc(paymentFromProfile(profile));
  doc.people = toPeople({ name: profile.name, emoji: profile.emoji, color: profile.color }, []);
  return { doc, step: 0, editingId: null };
}

/** Initial state from localStorage, or a request to load a shared split (?edit=id). */
function boot(editId: string | null): { draft: DraftState; editId: string | null; error: string | null; isNew: boolean } {
  const saved = load<DraftState | null>(DRAFT_KEY, null);
  const isNew = !(saved?.doc?.v === 1);
  let draft = isNew ? freshState() : saved!;
  // A draft nobody has started (no items, no date picked) belongs to today.
  if (!draft.editingId && draft.doc.items.length === 0 && !draft.doc.date && toDay(new Date(draft.doc.createdAt)) !== toDay(new Date())) {
    draft = { ...draft, doc: { ...draft.doc, createdAt: new Date().toISOString() } };
  }
  if (!editId) return { draft, editId: null, error: null, isNew };
  if (!getEditToken(editId))
    return { draft, editId: null, error: "You can only edit splits created on this device.", isNew: false };
  return { draft, editId, error: null, isNew: false };
}

export function Wizard() {
  // Read ?edit from the router, not window.location: on a client-side
  // navigation (Shared page → "Edit this split") this component can render
  // before the address bar changes, and would miss the request.
  const editParam = useSearchParams().get("edit");
  const [init] = useState(() => boot(editParam));
  const [state, setState] = useState<DraftState | null>(init.editId ? null : init.draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(init.error);
  const [crewOpen, setCrewOpen] = useState(init.isNew && !init.editId);
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

  // A photo picked with the navigation's Scan button: open the Items step
  // (a fresh split if the current one was already shared) so it can be read.
  useEffect(() => {
    const open = () =>
      setState((s) => (!s ? s : s.step === 4 ? freshState() : s.step === 0 ? s : { ...s, step: 0 }));
    if (hasPendingScan()) open();
    window.addEventListener(SCAN_EVENT, open);
    return () => window.removeEventListener(SCAN_EVENT, open);
  }, []);

  const calc = useMemo(() => (state ? calculate(state.doc) : null), [state]);

  if (!state || !calc || loadingEdit) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-center text-ink-2" aria-live="polite">
        {loadingEdit ? "Loading split…" : ""}
      </div>
    );
  }

  const { doc, step } = state;
  const setDoc: SetDoc = (fn) => setState((s) => (s ? { ...s, doc: fn(s.doc) } : s));
  const go = (n: number) => {
    setError(null);
    setState((s) => (s ? { ...s, step: n } : s));
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const setPeople = (people: Person[]) =>
    setDoc((d) => {
      const ids = new Set(people.map((p) => p.id));
      return { ...d, people, items: d.items.map((it) => ({ ...it, assigned: it.assigned.filter((a) => ids.has(a)) })) };
    });

  async function startNew() {
    if (
      doc.items.length &&
      step !== 4 &&
      !(await askConfirm({ title: "Discard this draft?", message: "Start a new split instead.", confirmLabel: "Discard", destructive: true }))
    )
      return;
    remove(DRAFT_KEY);
    setError(null);
    setState(freshState());
    setCrewOpen(true);
  }

  async function finish() {
    if (!calc?.complete) return;
    setBusy(true);
    setError(null);
    const clean: SplitDoc = {
      ...doc,
      title: doc.title.trim() || defaultTitle(billDate(doc)),
      people: doc.people.map((p, i) => ({ ...p, name: p.name.trim() || `Person ${i + 1}` })),
      items: doc.items.map((it, i) => ({ ...it, name: it.name.trim() || `Item ${i + 1}` })),
      payment: paymentFromProfile(getProfile()),
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
      rememberPeople(clean.people);
      upsertHistory({
        id,
        title: clean.title,
        ...historyFromDoc(clean),
        total: calculate(clean).total,
        currency: clean.currency,
        ...paidProgress(
          clean.people.map((p) => p.id),
          [],
        ),
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
    <div className="mx-auto max-w-2xl px-4 pb-[260px] md:pb-44">
      {/* Step tabs: segmented control on a glass track */}
      <nav aria-label="Steps" className="mb-6">
        <ol className="glass grid grid-cols-5 gap-1 rounded-full p-1">
          {STEPS.map((label, i) => {
            const reachable = i < 4 || (state.editingId !== null && step === 4);
            const current = i === step;
            return (
              <li key={label}>
                <button
                  type="button"
                  disabled={!reachable || current}
                  onClick={() => go(i)}
                  aria-current={current ? "step" : undefined}
                  className={cx(
                    "press flex min-h-10 w-full items-center justify-center rounded-full text-[13px] disabled:cursor-default",
                    current
                      ? "bg-[var(--glass-strong)] font-semibold text-ink shadow-[0_3px_10px_-2px_rgb(0_0_0/0.15),inset_0_0.5px_0_var(--glass-highlight)]"
                      : i < step
                        ? "font-medium text-accent"
                        : "font-medium text-ink-2",
                  )}
                >
                  {label}
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

      <div key={step}>
        {step === 0 && <ItemsStep doc={doc} setDoc={setDoc} calc={calc} editing={!!state.editingId} />}
        {step === 1 && <PeopleStep doc={doc} setDoc={setDoc} calc={calc} onPickFriends={() => setCrewOpen(true)} />}
        {step === 2 && <ExtrasStep doc={doc} setDoc={setDoc} calc={calc} />}
        {step === 3 && <ReviewStep doc={doc} setDoc={setDoc} calc={calc} goTo={go} />}
        {step === 4 && state.editingId && <ShareStep doc={doc} calc={calc} id={state.editingId} />}
      </div>

      {step < 4 && doc.items.length > 0 && (
        <div className="mt-8 text-center">
          <button type="button" className="btn-ghost text-[15px]" onClick={startNew}>
            Discard draft & start over
          </button>
        </div>
      )}

      <CrewSheet
        open={crewOpen}
        onClose={() => setCrewOpen(false)}
        people={doc.people}
        onConfirm={(people) => {
          setPeople(people);
          setCrewOpen(false);
        }}
      />

      {/* Floating glass action bar: above the navigation on phones, at the bottom on desktop. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(max(12px,env(safe-area-inset-bottom))+72px)] z-40 px-4 md:bottom-4">
        <div className="glass pointer-events-auto mx-auto max-w-2xl rounded-[30px] p-2">
          {error && (
            <div className="mb-2">
              <Callout tone="error">{error}</Callout>
            </div>
          )}
          <div className="flex items-center gap-2">
            {step > 0 && step < 4 && (
              <button type="button" className="press glass-flat grid size-11 shrink-0 place-items-center rounded-full text-ink" aria-label="Back" onClick={() => go(step - 1)}>
                <ChevronLeft size={22} {...ICON} />
              </button>
            )}
            <div className="min-w-0 flex-1 px-2 leading-tight">
              <span className="block truncate text-[13px] text-ink-2">
                {!canNext && nextHint ? <span className="text-warn">{nextHint}</span> : "Grand total"}
              </span>
              <Money value={calc.total} currency={doc.currency} className="text-[20px] font-bold tracking-tight" />
            </div>
            {step < 3 && (
              <button type="button" className="btn-primary h-11 shrink-0 px-5" disabled={!canNext} onClick={() => go(step + 1)}>
                Next
                <ChevronRight size={20} {...ICON} aria-hidden />
              </button>
            )}
            {step === 3 && (
              <button type="button" className="btn-primary h-11 shrink-0 px-5" disabled={!canNext || busy} onClick={finish}>
                {busy ? "Saving…" : state.editingId ? "Save & share" : "Finish & share"}
              </button>
            )}
            {step === 4 && (
              <>
                <button type="button" className="btn-secondary h-11 shrink-0 px-4" onClick={() => go(0)}>
                  Edit
                </button>
                <button type="button" className="btn-secondary h-11 shrink-0 px-4" onClick={startNew}>
                  New split
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
