"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { promptPayPayload } from "@/lib/promptpay";

export function PromptPayQR({ id, amount, name }: { id: string; amount: number; name?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((QR) => QR.toDataURL(promptPayPayload(id, amount), { margin: 1, width: 480, errorCorrectionLevel: "M" }))
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [id, amount]);

  return (
    <figure className="mx-auto mt-3 w-full max-w-64 rounded-2xl bg-white p-3 text-center text-zinc-900">
      <div className="mb-2 rounded-lg bg-[#1a3a6b] py-1 text-sm font-bold tracking-wide text-white">PromptPay</div>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`PromptPay QR for ${formatMoney(amount, "THB")}`} className="aspect-square w-full" />
      ) : (
        <div className="aspect-square w-full animate-pulse rounded bg-zinc-100" />
      )}
      <figcaption className="mt-1 text-sm">
        {name && <span className="block text-zinc-500">{name}</span>}
        <b className="tabular-nums">{formatMoney(amount, "THB")}</b>
      </figcaption>
    </figure>
  );
}
