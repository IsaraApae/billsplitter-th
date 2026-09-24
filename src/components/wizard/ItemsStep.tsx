"use client";

import { AlertTriangle, Camera, CheckCircle2, CloudOff, ImageIcon, Plus, Sparkles, Trash2, X, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CalcResult } from "@/lib/calc";
import { lineTotal } from "@/lib/calc";
import { loadUpright, uploadJpeg } from "@/lib/client/image";
import { applyScan, uid } from "@/lib/draft";
import { CURRENCIES, formatMoney } from "@/lib/money";
import type { DroppedLine } from "@/lib/scanFilter";
import type { ScanResult } from "@/lib/scanResult";
import type { SplitDoc } from "@/lib/types";
import { Callout, Money, MoneyInput, QtyStepper, Section, Sheet, cx } from "../ui";
import type { SetDoc } from "./Wizard";

type ScanState =
  | { status: "idle" }
  | { status: "preparing" }
  | { status: "cloud" }
  | { status: "ocr"; progress: number };

interface ScanInfo {
  engine: "gemini" | "offline";
  reason?: string; // why we fell back to offline
  notes: { tone: "info" | "warn" | "error"; text: string }[];
  dropped: DroppedLine[];
}

const REASONS: Record<string, string> = {
  not_configured: "cloud scanning isn't set up",
  quota: "free cloud quota used up",
  timeout: "cloud scan timed out",
  network: "couldn't reach the cloud",
  api_error: "cloud service error",
  bad_output: "cloud result unreadable",
  rate_limited: "too many scans in a minute",
  offline: "you're offline",
};

// Kept at module level so the photo survives moving between steps.
let lastReceipt: { url: string; info: ScanInfo | null } | null = null;

export function ItemsStep({ doc, setDoc, calc }: { doc: SplitDoc; setDoc: SetDoc; calc: CalcResult }) {
  const [scan, setScan] = useState<ScanState>({ status: "idle" });
  const [receipt, setReceipt] = useState(lastReceipt);
  const [zoom, setZoom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  useEffect(() => {
    lastReceipt = receipt;
  }, [receipt]);

  const busy = scan.status !== "idle";
  const currency = doc.currency;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setScan({ status: "preparing" });
    let upright: HTMLCanvasElement;
    let upload: Blob;
    try {
      upright = await loadUpright(file); // EXIF rotation fixed here
      upload = await uploadJpeg(upright); // ~2048px, JPEG 0.85
    } catch (e) {
      setScan({ status: "idle" });
      setError((e as Error).message);
      return;
    }
    if (receipt) URL.revokeObjectURL(receipt.url);
    const url = URL.createObjectURL(upload);
    setReceipt({ url, info: null });

    setScan({ status: "cloud" });
    let result: ScanResult | null = null;
    let reason = "";
    try {
      const fd = new FormData();
      fd.append("image", upload, "receipt.jpg");
      const res = await fetch("/api/scan", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (res.ok && data && Array.isArray(data.items)) result = { ...(data as ScanResult), engine: "gemini" };
      else reason = data?.reason ?? data?.error ?? `http_${res.status}`;
    } catch {
      reason = navigator.onLine ? "network" : "offline";
    }

    if (!result) {
      console.info("[scan] cloud scan unavailable → on-device OCR", { reason });
      setScan({ status: "ocr", progress: 0 });
      try {
        const { scanOnDevice } = await import("@/lib/client/ocr");
        result = { ...(await scanOnDevice(upright, (p) => setScan({ status: "ocr", progress: p }))), engine: "offline" };
      } catch (e) {
        console.error("[scan] on-device OCR failed", e);
        setScan({ status: "idle" });
        setError(`${REASONS[reason] ?? "Cloud scan failed"}, and on-device scanning failed too. Please add the items manually.`);
        return;
      }
    }
    upright.width = upright.height = 0; // free the big canvas

    // Apply against the latest doc (the user may have edited while we scanned).
    const r = applyScan(docRef.current, result);
    setDoc(() => r.doc);
    setScan({ status: "idle" });
    console.info("[scan] done", { engine: result.engine, reason: reason || undefined, items: r.added, dropped: r.dropped });

    const notes: ScanInfo["notes"] = [];
    if (result.engine === "offline")
      notes.push({ tone: "warn", text: "Scanned on your device — results may need more editing, so check each line against the photo." });
    if (r.added === 0) notes.push({ tone: "warn", text: "No items found. Try a sharper, well-lit photo, or add items manually." });
    r.notes.forEach((text) => notes.push({ tone: "info", text }));
    setReceipt({ url, info: { engine: result.engine!, reason: reason || undefined, notes, dropped: r.dropped } });
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
  const info = receipt?.info;

  return (
    <div className="space-y-7">
      <div>
        <h1 className="large-title">New split</h1>
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <input
            className="input text-[17px] font-semibold"
            placeholder="Title, e.g. Friday dinner"
            aria-label="Split title"
            maxLength={80}
            value={doc.title}
            onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))}
          />
          <select
            aria-label="Currency"
            className="input w-[5.5rem] px-3"
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
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" className="btn-primary h-14 text-[16px]" disabled={busy} onClick={() => cameraRef.current?.click()}>
          <Camera size={20} aria-hidden /> Scan receipt
        </button>
        <button type="button" className="btn-secondary h-14 text-[16px]" disabled={busy} onClick={() => galleryRef.current?.click()}>
          <ImageIcon size={20} aria-hidden /> From photos
        </button>
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
      </div>

      {busy && (
        <div className="card flex items-center gap-3 p-4" aria-live="polite">
          <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent motion-reduce:animate-none" />
          <span className="text-[15px] font-medium">
            {scan.status === "preparing" && "Preparing photo…"}
            {scan.status === "cloud" && "Reading receipt…"}
            {scan.status === "ocr" && `Scanning on device… ${scan.progress}%`}
          </span>
        </div>
      )}
      {error && <Callout tone="error">{error}</Callout>}

      {receipt && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setZoom(true)}
            className="card group relative block w-full overflow-hidden p-0 text-left"
            aria-label="Zoom receipt photo"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={receipt.url} alt="Scanned receipt" className="h-48 w-full object-cover object-center" />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-4 pt-8 pb-3 text-[13px] font-semibold text-white">
              Tap to compare with your items
              <ZoomIn size={18} aria-hidden />
            </span>
          </button>
          {info && (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cx(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold",
                  info.engine === "gemini" ? "bg-accent-soft text-accent-strong" : "bg-warn-soft text-warn",
                )}
              >
                {info.engine === "gemini" ? <Sparkles size={14} aria-hidden /> : <CloudOff size={14} aria-hidden />}
                {info.engine === "gemini" ? "Scanned with Gemini" : "Scanned offline"}
              </span>
              {info.engine === "offline" && info.reason && (
                <span className="text-[13px] text-ink-2">{REASONS[info.reason] ?? info.reason}</span>
              )}
            </div>
          )}
          {info?.notes
            .filter((n) => n.tone !== "info")
            .map((n, i) => (
              <Callout key={i} tone={n.tone}>
                {n.text}
              </Callout>
            ))}
          {info && info.notes.some((n) => n.tone === "info") && (
            <Callout tone="info">
              <ul className="list-disc space-y-1 pl-4">
                {info.notes
                  .filter((n) => n.tone === "info")
                  .map((n, i) => (
                    <li key={i}>{n.text}</li>
                  ))}
              </ul>
            </Callout>
          )}
          {info && info.dropped.length > 0 && (
            <details className="px-1 text-[13px] text-ink-2">
              <summary className="min-h-8 cursor-pointer">Ignored {info.dropped.length} non-item line(s)</summary>
              <p className="mt-1">{info.dropped.map((d) => d.name || "(blank)").join(" · ")}</p>
            </details>
          )}
        </div>
      )}

      <Section
        title={`Items${doc.items.length ? ` · ${doc.items.length}` : ""}`}
        action={
          doc.items.length > 0 && (
            <button
              type="button"
              className="btn-ghost px-3 text-sm text-danger"
              onClick={() => confirm("Remove all items?") && setDoc((d) => ({ ...d, items: [], receipt: { subtotal: null, total: null } }))}
            >
              Clear all
            </button>
          )
        }
      >
        {mismatch && (
          <div className="sticky top-[76px] z-20">
            <div className="glass flex items-start gap-3 rounded-2xl p-3.5 text-warn" role="status">
              <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden />
              <p className="text-[14px] leading-snug font-medium">
                Items add up to <b className="tnum">{formatMoney(sub, currency)}</b> but the receipt says{" "}
                <b className="tnum">{formatMoney(printed!, currency)}</b> ({sub > printed! ? "+" : "−"}
                {formatMoney(Math.abs(sub - printed!), currency)}). Compare with the photo.
              </p>
            </div>
          </div>
        )}
        {printed !== null && !mismatch && doc.items.length > 0 && (
          <Callout tone="success" icon={<CheckCircle2 size={18} />}>
            Items match the receipt subtotal.
          </Callout>
        )}
        {doc.items.length === 0 && !busy && (
          <p className="card p-5 text-[15px] text-ink-2">
            Scan a receipt or add items by hand. Thai and English receipts both work.
          </p>
        )}
        <ul className="space-y-2.5">
          {doc.items.map((it, i) => (
            <li key={it.id} className="card space-y-2.5 p-3">
              <div className="flex gap-2">
                <input
                  className="input font-semibold"
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
                  className="icon-btn hover:bg-danger-soft hover:text-danger"
                  onClick={() => removeItem(it.id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <QtyStepper value={it.qty} onChange={(qty) => updateItem(it.id, { qty })} />
                <X size={14} className="shrink-0 text-ink-3" aria-hidden />
                <MoneyInput
                  className="min-w-0 flex-1"
                  value={it.price}
                  currency={currency}
                  ariaLabel={`Item ${i + 1} unit price`}
                  onChange={(price) => updateItem(it.id, { price })}
                />
              </div>
              {it.qty > 1 && (
                <p className="text-right text-[13px] font-medium text-ink-2">
                  = <Money value={lineTotal(it)} currency={currency} />
                </p>
              )}
            </li>
          ))}
        </ul>
        <button type="button" className="btn-secondary h-12 w-full" onClick={addItem}>
          <Plus size={18} aria-hidden /> Add item
        </button>
      </Section>

      {doc.items.length > 0 && (
        <div className="flex items-baseline justify-between px-1">
          <span className="font-semibold text-ink-2">Items subtotal</span>
          <Money value={sub} currency={currency} className="text-xl font-bold" />
        </div>
      )}

      <Sheet open={zoom} onClose={() => setZoom(false)} title="Receipt">
        {receipt && <ZoomableImage src={receipt.url} />}
      </Sheet>
    </div>
  );
}

/** Pinch/scroll to pan; buttons to zoom (works the same on iOS and Android). */
function ZoomableImage({ src }: { src: string }) {
  const [scale, setScale] = useState(1);
  return (
    <div className="space-y-3">
      <div className="max-h-[68dvh] overflow-auto rounded-2xl bg-white [touch-action:pan-x_pan-y_pinch-zoom]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Receipt photo" style={{ width: `${scale * 100}%`, maxWidth: "none" }} className="block" />
      </div>
      <div className="flex justify-center gap-2" role="group" aria-label="Zoom">
        {[1, 2, 3].map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={scale === s}
            onClick={() => setScale(s)}
            className={cx("chip justify-center px-5", scale === s ? "bg-accent text-accent-ink" : "glass-lite text-ink")}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
