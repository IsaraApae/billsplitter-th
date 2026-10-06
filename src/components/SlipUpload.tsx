"use client";

import { ImageUp, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

type Stage = "preparing" | "uploading" | "checking";

const STAGE_TEXT: Record<Stage, string> = {
  preparing: "Preparing the picture…",
  uploading: "Uploading…",
  checking: "Checking your slip…",
};

/** POST with upload progress (fetch can't report it). */
function postWithProgress(url: string, body: FormData, onUpload: (fraction: number) => void) {
  return new Promise<{ status: number; data: unknown }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 70_000;
    xhr.upload.onprogress = (e) => e.lengthComputable && onUpload(e.loaded / e.total);
    xhr.upload.onload = () => onUpload(1);
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("Couldn't reach the server."));
    xhr.ontimeout = () => reject(new Error("Checking the slip took too long — try again."));
    xhr.send(body);
  });
}

/**
 * "Already paid? Upload your slip" — the friend picks their transfer slip,
 * the server reads and checks it, and ticks them if it's good. A progress
 * bar follows preparing → uploading → checking.
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
  const [progress, setProgress] = useState<{ stage: Stage; pct: number } | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const busy = progress !== null;

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stopTimer, []);

  async function send(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    setProgress({ stage: "preparing", pct: 4 });
    try {
      const small = await compressImage(file, 1600, 0.85);
      const fd = new FormData();
      fd.append("image", small, "slip.jpg");
      fd.append(field, personRef);
      setProgress({ stage: "uploading", pct: 10 });
      let checkingFrom = 0;
      const { status, data } = await postWithProgress(endpoint, fd, (f) => {
        if (f < 1) {
          setProgress({ stage: "uploading", pct: 10 + Math.round(f * 30) });
          return;
        }
        if (checkingFrom) return;
        // Uploaded: the server now reads the slip (usually 3–10 s). The bar
        // keeps creeping towards 95 % until the answer arrives.
        checkingFrom = Date.now();
        setProgress({ stage: "checking", pct: 40 });
        timer.current = setInterval(() => {
          const t = (Date.now() - checkingFrom) / 6000;
          setProgress({ stage: "checking", pct: Math.round(40 + 55 * (1 - Math.exp(-t))) });
        }, 200);
      });
      stopTimer();
      const body = data as { message?: string } | null;
      if (status < 200 || status >= 300) throw new Error(body?.message ?? `Couldn't check the slip (${status}).`);
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
      stopTimer();
      setProgress(null);
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
      {progress ? (
        <div className="space-y-2 py-1" aria-live="polite">
          <div className="flex items-baseline justify-between gap-2 text-[15px]">
            <span className="font-semibold">{STAGE_TEXT[progress.stage]}</span>
            <span className="tnum text-ink-2">{progress.pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Slip upload"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.pct}
            className="h-2 overflow-hidden rounded-full bg-[var(--field)]"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${progress.pct}%` }} />
          </div>
          <ol className="flex justify-between text-[13px] text-ink-2">
            {(["preparing", "uploading", "checking"] as Stage[]).map((s, i) => {
              const at = ["preparing", "uploading", "checking"].indexOf(progress.stage);
              return (
                <li key={s} className={i <= at ? "font-semibold text-accent" : undefined}>
                  {["Prepare", "Upload", "Check"][i]}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <button type="button" className="btn-secondary h-12 w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
          <ImageUp size={20} {...ICON} aria-hidden /> Upload slip
        </button>
      )}
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
