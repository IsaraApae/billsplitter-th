"use client";

import { ImageUp, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { compressImage } from "@/lib/client/image";
import { formatMoney } from "@/lib/money";
import { Callout, ICON } from "./ui";

/** What the slip endpoints answer with when a slip is accepted. */
export interface SlipResult {
  result: "full" | "part";
  amount: number;
  left: number;
  receiver: "match" | "unknown";
}

/**
 * "Already paid? Upload your slip" — the friend picks their transfer slip,
 * the server reads and checks it, and ticks them if it's good.
 */
export function SlipUpload<T extends SlipResult>({
  endpoint,
  field,
  personRef,
  currency,
  onAccepted,
}: {
  /** e.g. /api/splits/<id>/slip */
  endpoint: string;
  field: "personId" | "personKey";
  personRef: string;
  currency: string;
  onAccepted: (r: T) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function send(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const small = await compressImage(file, 1600, 0.85);
      const fd = new FormData();
      fd.append("image", small, "slip.jpg");
      fd.append(field, personRef);
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? `Couldn't check the slip (${res.status}).`);
      const r = data as T;
      setMsg({
        tone: "success",
        text:
          r.result === "full"
            ? `Slip checked — ${formatMoney(r.amount, currency)} received. You're marked as paid.`
            : `Slip checked — ${formatMoney(r.amount, currency)} received, ${formatMoney(r.left, currency)} still to pay.`,
      });
      onAccepted(r);
    } catch (e) {
      setMsg({ tone: "error", text: navigator.onLine ? (e as Error).message : "You're offline — try again when connected." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3 p-5">
      <p className="flex items-center gap-2 font-semibold">
        <ShieldCheck size={20} {...ICON} className="text-accent" aria-hidden /> Already paid?
      </p>
      <p className="text-[15px] text-ink-2">
        Upload your transfer slip. It&apos;s checked (amount, date, who it was paid to) and you&apos;re ticked
        automatically.
      </p>
      <button type="button" className="btn-secondary h-12 w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
        <ImageUp size={20} {...ICON} aria-hidden /> {busy ? "Checking your slip…" : "Upload slip"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void send(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
    </div>
  );
}
