"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { qrImageUrl } from "@/lib/client/profile";
import { formatMoney } from "@/lib/money";
import { promptPayPayload } from "@/lib/promptpay";
import { Callout, Money } from "./ui";

export type PayQrSource =
  | { mode: "generate"; promptpay: string }
  | { mode: "upload"; ownerId: string; version: number };

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
  const H = 1400;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1a3a6b";
  ctx.fillRect(0, 0, W, 150);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans Thai", sans-serif';
  ctx.font = `700 64px ${font}`;
  ctx.fillText("PromptPay", W / 2, 100);
  // Keep the QR square and centred whatever the uploaded image's shape.
  const s = Math.min(qr / img.width, qr / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, (W - dw) / 2, 190 + (qr - dh) / 2, dw, dh);
  ctx.fillStyle = "#0b1220";
  ctx.font = `700 76px ${font}`;
  ctx.fillText(formatMoney(amount, "THB"), W / 2, 190 + qr + 110);
  ctx.fillStyle = "#394457";
  ctx.font = `500 40px ${font}`;
  ctx.fillText(
    withAmount ? `${name} · amount included` : `${name} · enter this amount in your bank app`,
    W / 2,
    190 + qr + 175,
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
      <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-3xl bg-white text-[#0b1220] shadow-[0_20px_40px_-20px_rgb(0_0_0/0.35)]">
        <div className="bg-[#1a3a6b] py-2.5 text-center text-[17px] font-bold tracking-wide text-white">PromptPay</div>
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
            <div className="aspect-square w-full animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
          )}
          <div className="mt-3 text-center">
            <p className="text-[14px] font-medium text-[#394457]">{name}</p>
            <Money value={amount} currency="THB" className="text-[34px] font-bold tracking-tight" />
          </div>
        </div>
      </div>
      {!withAmount && (
        <Callout tone="info">This QR doesn&apos;t include the amount — type {formatMoney(amount, "THB")} in your bank app.</Callout>
      )}
      <button type="button" className="btn-primary h-13 w-full text-[17px]" disabled={!src || broken || saving} onClick={saveQr}>
        <Download size={20} aria-hidden /> {saving ? "Preparing…" : "Save QR"}
      </button>
      <p className="text-center text-[13px] text-ink-2">
        {msg ?? "Save it to Photos, then open it from your banking app's “Scan QR”."}
      </p>
    </div>
  );
}
