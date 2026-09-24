"use client";

import { useEffect, useRef, useState } from "react";
import type { CalcResult } from "@/lib/calc";
import { lineTotal } from "@/lib/calc";
import { compressImage } from "@/lib/client/image";
import { applyScan, uid } from "@/lib/draft";
import { CURRENCIES, formatMoney } from "@/lib/money";
import type { ScanResult } from "@/lib/scanResult";
import type { SplitDoc } from "@/lib/types";
import { Callout, MoneyInput, QtyStepper, Section } from "../ui";
import type { SetDoc } from "./Wizard";

type ScanState =
  | { status: "idle" }
  | { status: "preparing" }
  | { status: "cloud" }
  | { status: "ocr"; progress: number };

export function ItemsStep({ doc, setDoc, calc }: { doc: SplitDoc; setDoc: SetDoc; calc: CalcResult }) {
  const [scan, setScan] = useState<ScanState>({ status: "idle" });
  const [notes, setNotes] = useState<{ tone: "info" | "warn" | "error"; text: string }[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const busy = scan.status !== "idle";
  const currency = doc.currency;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setNotes([]);
    setScan({ status: "preparing" });
    let blob: Blob;
    try {
      blob = await compressImage(file);
    } catch (e) {
      setScan({ status: "idle" });
      setNotes([{ tone: "error", text: (e as Error).message }]);
      return;
    }
    setPreview(URL.createObjectURL(blob));

    setScan({ status: "cloud" });
    let result: ScanResult | null = null;
    let reason = "";
    try {
      const fd = new FormData();
      fd.append("image", blob, "receipt.jpg");
      const res = await fetch("/api/scan", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (res.ok && data && Array.isArray(data.items)) result = data as ScanResult;
      else if (res.status === 429 && data?.error === "quota") reason = "Cloud scanning quota reached";
      else reason = data?.message?.replace(/\.$/, "") ?? `Cloud scan failed (${res.status})`;
    } catch {
      reason = navigator.onLine ? "Couldn't reach the server" : "You're offline";
    }

    let onDevice = false;
    if (!result) {
      setScan({ status: "ocr", progress: 0 });
      try {
        const { scanOnDevice } = await import("@/lib/client/ocr");
        result = await scanOnDevice(blob, (p) => setScan({ status: "ocr", progress: p }));
        onDevice = true;
      } catch (e) {
        console.error(e);
        setScan({ status: "idle" });
        setNotes([
          { tone: "error", text: `${reason}, and on-device scanning failed too. Please add the items manually.` },
        ]);
        return;
      }
    }

    // Apply against the latest doc (the user may have edited while we scanned).
    const r = applyScan(docRef.current, result);
    setDoc(() => r.doc);
    setScan({ status: "idle" });
    const next: typeof notes = [];
    if (onDevice)
      next.push({
        tone: "warn",
        text: `${reason} — scanned on your device instead. Results may need more editing, so check each line.`,
      });
    if (r.added === 0)
      next.push({ tone: "warn", text: "No items found. Try a sharper, well-lit photo, or add items manually." });
    else next.push({ tone: "info", text: `Added ${r.added} item${r.added === 1 ? "" : "s"} — check and fix anything below.` });
    r.notes.forEach((t) => next.push({ tone: "info", text: t }));
    setNotes(next);
  }

  const updateItem = (id: string, patch: Partial<SplitDoc["items"][number]>) =>
    setDoc((d) => ({ ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));

  const addItem = () => {
    const id = uid();
    setDoc((d) => ({ ...d, items: [...d.items, { id, name: "", qty: 1, price: 0, assigned: [] }] }));
    setFocusId(id);
  };

  const removeItem = (id: string) =>
    setDoc((d) => ({
      ...d,
      items: d.items.filter((it) => it.id !== id),
      discount: { ...d.discount, itemIds: d.discount.itemIds.filter((x) => x !== id) },
    }));

  const sub = calc.itemsSubtotal;
  const printed = doc.receipt.subtotal;
  const mismatch = printed !== null && printed !== sub;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          className="input"
          placeholder="Title, e.g. Friday dinner"
          aria-label="Split title"
          maxLength={80}
          value={doc.title}
          onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))}
        />
        <select
          aria-label="Currency"
          className="input w-24"
          value={currency}
          disabled={doc.items.length > 0}
          title={doc.items.length > 0 ? "Clear items to change currency" : undefined}
          onChange={(e) => setDoc((d) => ({ ...d, currency: e.target.value }))}
        >
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      <Section title="Add items">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-primary h-14" disabled={busy} onClick={() => cameraRef.current?.click()}>
            <span aria-hidden>📷</span> Scan receipt
          </button>
          <button type="button" className="btn-secondary h-14" disabled={busy} onClick={() => galleryRef.current?.click()}>
            <span aria-hidden>🖼️</span> From photos
          </button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {busy && (
          <div className="card flex items-center gap-3 p-4" aria-live="polite">
            <span className="size-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <span className="text-sm">
              {scan.status === "preparing" && "Preparing photo…"}
              {scan.status === "cloud" && "Reading receipt…"}
              {scan.status === "ocr" && `Scanning on device… ${scan.progress}% (first time downloads Thai + English data)`}
            </span>
          </div>
        )}
        {notes.map((n, i) => (
          <Callout key={i} tone={n.tone}>
            {n.text}
          </Callout>
        ))}
        {preview && (
          <div>
            <button type="button" className="btn-ghost -ml-3 text-sm" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? "Hide receipt photo" : "Show receipt photo"}
            </button>
            {showPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Scanned receipt" className="mt-2 max-h-[70vh] w-full rounded-xl object-contain" />
            )}
          </div>
        )}
      </Section>

      <Section
        title={`Items${doc.items.length ? ` (${doc.items.length})` : ""}`}
        action={
          doc.items.length > 0 && (
            <button
              type="button"
              className="btn-ghost text-sm text-red-600 dark:text-red-400"
              onClick={() =>
                confirm("Remove all items?") &&
                setDoc((d) => ({ ...d, items: [], receipt: { subtotal: null, total: null } }))
              }
            >
              Clear all
            </button>
          )
        }
      >
        {doc.items.length === 0 && !busy && (
          <p className="card p-4 text-sm text-zinc-500">
            Scan a receipt or add items by hand. Receipts in Thai or English both work.
          </p>
        )}
        <ul className="space-y-2">
          {doc.items.map((it, i) => (
            <li key={it.id} className="card space-y-2 p-3">
              <div className="flex gap-2">
                <input
                  className="input font-medium"
                  placeholder={`Item ${i + 1}`}
                  aria-label={`Item ${i + 1} name`}
                  maxLength={80}
                  value={it.name}
                  autoFocus={focusId === it.id}
                  onChange={(e) => updateItem(it.id, { name: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Delete ${it.name || `item ${i + 1}`}`}
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-xl text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                  onClick={() => removeItem(it.id)}
                >
                  ×
                </button>
              </div>
              <div className="flex items-center gap-2">
                <QtyStepper value={it.qty} onChange={(qty) => updateItem(it.id, { qty })} />
                <span className="text-zinc-400">×</span>
                <MoneyInput
                  className="min-w-0 flex-1"
                  value={it.price}
                  currency={currency}
                  ariaLabel={`Item ${i + 1} unit price`}
                  onChange={(price) => updateItem(it.id, { price })}
                />
              </div>
              {it.qty > 1 && (
                <p className="text-right text-sm text-zinc-500 tabular-nums">
                  = {formatMoney(lineTotal(it), currency)}
                </p>
              )}
            </li>
          ))}
        </ul>
        <button type="button" className="btn-secondary w-full border-dashed" onClick={addItem}>
          + Add item
        </button>
      </Section>

      {doc.items.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between px-1 font-semibold">
            <span>Items subtotal</span>
            <span className="tabular-nums">{formatMoney(sub, currency)}</span>
          </div>
          {printed !== null &&
            (mismatch ? (
              <Callout tone="warn">
                Items add up to <b>{formatMoney(sub, currency)}</b>, but the receipt&apos;s subtotal is{" "}
                <b>{formatMoney(printed, currency)}</b> ({sub > printed ? "+" : "−"}
                {formatMoney(Math.abs(sub - printed), currency)}). Check for missed or misread items.
              </Callout>
            ) : (
              <Callout tone="success">✓ Matches the receipt subtotal.</Callout>
            ))}
        </div>
      )}
    </div>
  );
}
