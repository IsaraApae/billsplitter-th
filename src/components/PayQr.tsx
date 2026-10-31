"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { qrImageUrl } from "@/lib/client/profile";
import { formatMoney } from "@/lib/money";
import { effectiveQrMode, promptPayPayload } from "@/lib/promptpay";
import type { PaymentInfo } from "@/lib/types";
import { Callout, ICON, Money } from "./ui";

export type PayQrSource =
  | { mode: "generate"; promptpay: string }
  | { mode: "upload"; ownerId: string; version: number };

/** The QR for paying an organiser from a bill's payment details (in the browser), or null. */
export function organiserQr(payment: PaymentInfo | undefined, currency: string): PayQrSource | null {
  if (!payment || currency !== "THB") return null;
  const mode = effectiveQrMode(payment, currency);
  if (mode === "generate") return { mode, promptpay: payment.promptpay };
  // An uploaded QR: refreshed daily in case it was replaced.
  if (mode === "upload" && payment.ownerId) return { mode, ownerId: payment.ownerId, version: Math.floor(Date.now() / 86_400_000) };
  return null;
}

/** The QR as an image URL (data: for generated, same-origin for uploaded). */
function useQrSrc(source: PayQrSource, amount: number): string | null {
  const [generated, setGenerated] = useState<string | null>(null);
  const payload = source.mode === "generate" ? promptPayPayload(source.promptpay, amount) : null;
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    import("qrcode")
      .then((QR) => QR.toDataURL(payload, { margin: 1, width: 720, errorCorrectionLevel: "M" }))
      .then((url) => !cancelled && setGenerated(url))
      .catch(() => !cancelled && setGenerated(null));
    return () => {
      cancelled = true;
    };
  }, [payload]);
  return source.mode === "upload" ? qrImageUrl(source.ownerId, source.version) : generated;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** A shareable PNG: QR + who/what, so the payer can open it from Photos in their bank app. */
async function renderCard(src: string, name: string, amount: number, withAmount: boolean): Promise<Blob> {
  const img = await loadImage(src);
  const W = 1080;
  const qr = 880;
  const top = 100;
  const H = top + qr + 230;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans Thai", sans-serif';
  // Keep the QR square and centred whatever the uploaded image's shape.
  const s = Math.min(qr / img.width, qr / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, (W - dw) / 2, top + (qr - dh) / 2, dw, dh);
  ctx.fillStyle = "#0b1220";
  ctx.font = `700 76px ${font}`;
  ctx.fillText(formatMoney(amount, "THB"), W / 2, top + qr + 110);
  ctx.fillStyle = "#394457";
  ctx.font = `500 40px ${font}`;
  ctx.fillText(
    withAmount ? `${name} · amount included` : `${name} · enter this amount in your bank app`,
    W / 2,
    top + qr + 175,
  );
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

export function PayQr({ source, amount, name }: { source: PayQrSource; amount: number; name: string }) {
  const src = useQrSrc(source, amount);
  const [broken, setBroken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const withAmount = source.mode === "generate";

  async function saveQr() {
    if (!src) return;
    setSaving(true);
    setMsg(null);
    try {
      const blob = await renderCard(src, name, amount, withAmount);
      const file = new File([blob], `promptpay-${(amount / 100).toFixed(2)}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        // iOS/Android share sheet → "Save Image" puts it in Photos.
        await navigator.share({ files: [file], title: "PromptPay QR" });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        setMsg("Saved to your downloads.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg("Couldn't save the QR — take a screenshot instead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[8px] bg-white text-[#0b1220] shadow-[var(--card-shadow)]">
        <div className="p-5">
          {broken ? (
            <p className="py-16 text-center text-[15px]">The QR image is no longer available.</p>
          ) : src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={`PromptPay QR for ${formatMoney(amount, "THB")}`}
              className="aspect-square w-full object-contain [image-rendering:pixelated]"
              onError={() => setBroken(true)}
            />
          ) : (
            <div className="aspect-square w-full rounded-[8px] bg-[#f2f2f7]" />
          )}
          <div className="mt-3 text-center">
            <p className="text-[15px] font-medium text-[#394457]">{name}</p>
            <Money value={amount} currency="THB" className="text-[34px] font-bold tracking-tight" />
          </div>
        </div>
      </div>
      {!withAmount && (
        <Callout tone="info">This QR doesn&apos;t include the amount — type {formatMoney(amount, "THB")} in your bank app.</Callout>
      )}
      <button type="button" className="btn-primary h-13 w-full" disabled={!src || broken || saving} onClick={saveQr}>
        <Download size={22} {...ICON} aria-hidden /> {saving ? "Preparing…" : "Save QR"}
      </button>
      <p className="text-center text-[13px] text-ink-2">
        {msg ?? "Save it to Photos, then open it from your banking app's “Scan QR”."}
      </p>
    </div>
  );
}
