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
 * "Already paid? Upload your slip" — the friend picks their transfer slip
 * (or several, for a payment made in parts), the server reads and checks it,
 * and ticks them if it's good. The picture shows while a progress bar
 * follows preparing → uploading → checking.
 */
export function SlipUpload<T extends SlipResult>({
  endpoint,
  field,
  personRef,
  currency,
  onAccepted,
  bare = false,
}: {
  /** e.g. /api/splits/<id>/slip */
  endpoint: string;
  field: "personId" | "personKey" | "items";
  personRef: string;
  currency: string;
  onAccepted: (r: T) => void;
  /** without its own "Already paid?" heading (when the sheet already says it) */
  bare?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ stage: Stage; pct: number; of?: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<{ tone: "success" | "error"; text: string }[]>([]);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const busy = progress !== null;

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stopTimer, []);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  /** One slip: resolves to the server's answer, or throws with a message to show. */
  async function sendOne(file: File, of?: string): Promise<T> {
    setProgress({ stage: "preparing", pct: 4, of });
    // Slips are mostly text: 1600 px on the long side reads well and uploads fast.
    const small = await compressImage(file, 1600, 0.8);
    const fd = new FormData();
    fd.append("image", small, "slip.jpg");
    fd.append(field, personRef);
    setProgress({ stage: "uploading", pct: 10, of });
    let checkingFrom = 0;
    const { status, data } = await postWithProgress(endpoint, fd, (f) => {
      if (f < 1) {
        setProgress({ stage: "uploading", pct: 10 + Math.round(f * 30), of });
        return;
      }
      if (checkingFrom) return;
      // Uploaded: the server now reads the slip (usually 3–8 s). The bar
      // keeps creeping towards 95 % until the answer arrives.
      checkingFrom = Date.now();
      setProgress({ stage: "checking", pct: 40, of });
      timer.current = setInterval(() => {
        const t = (Date.now() - checkingFrom) / 5000;
        setProgress({ stage: "checking", pct: Math.round(40 + 55 * (1 - Math.exp(-t))), of });
      }, 200);
    });
    stopTimer();
    const body = data as { message?: string } | null;
    if (status < 200 || status >= 300) throw new Error(body?.message ?? `Couldn't check the slip (${status}).`);
    return data as T;
  }

  async function send(files: File[]) {
    if (files.length === 0) return;
    setMsgs([]);
    const out: { tone: "success" | "error"; text: string }[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const of = files.length > 1 ? `Slip ${i + 1} of ${files.length}` : undefined;
        setPreview(URL.createObjectURL(files[i])); // the old one is released by the effect above
        try {
          const r = await sendOne(files[i], of);
          out.push({
            tone: "success",
            text:
              r.result === "full"
                ? `${of ? `${of}: ` : ""}Slip checked — ${formatMoney(r.amount, currency)} received. You're marked as paid.`
                : `${of ? `${of}: ` : ""}Slip checked — ${formatMoney(r.amount, currency)} received, ${formatMoney(r.left, currency)} still to pay.`,
          });
          onAccepted(r);
          if (r.result === "full") {
            setDone(true);
            break;
          }
        } catch (e) {
          out.push({
            tone: "error",
            text: `${of ? `${of}: ` : ""}${navigator.onLine ? (e as Error).message : "You're offline — try again when connected."}`,
          });
        }
        setMsgs([...out]);
      }
    } finally {
      stopTimer();
      setProgress(null);
      setMsgs([...out]);
    }
  }

  const failed = msgs.length > 0 && msgs[msgs.length - 1].tone === "error";

  return (
    <div className="card space-y-3 p-5">
      {!bare && (
        <>
          <p className="flex items-center gap-2 font-semibold">
            <ShieldCheck size={20} {...ICON} className="text-accent" aria-hidden /> Already paid?
          </p>
          <p className="text-[15px] text-ink-2">
            Upload your transfer slip. It&apos;s checked (amount, date, who it was paid to) and you&apos;re ticked
            automatically.
          </p>
        </>
      )}
      {preview && (busy || msgs.length > 0) && (
        // The slip being checked, so it's clear which picture this is about.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Your slip" className="mx-auto max-h-56 rounded-[8px] border border-[var(--line)] object-contain" />
      )}
      {progress ? (
        <div className="space-y-2 py-1" aria-live="polite">
          <div className="flex items-baseline justify-between gap-2 text-[15px]">
            <span className="font-semibold">
              {progress.of && <span className="text-ink-2">{progress.of} · </span>}
              {STAGE_TEXT[progress.stage]}
            </span>
            <span className="tnum text-ink-2">{progress.pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Slip upload"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.pct}
            className="h-2 overflow-hidden rounded-[2px] bg-[var(--field)]"
          >
            <div className="h-full rounded-[2px] bg-accent-fill transition-[width] duration-200" style={{ width: `${progress.pct}%` }} />
          </div>
          <ol className="flex justify-between text-[13px] text-ink-2">
            {(["preparing", "uploading", "checking"] as Stage[]).map((st, i) => {
              const at = ["preparing", "uploading", "checking"].indexOf(progress.stage);
              return (
                <li key={st} className={i <= at ? "font-semibold text-accent" : undefined}>
                  {["Prepare", "Upload", "Check"][i]}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        !done && (
          <button type="button" className={failed ? "btn-primary h-12 w-full" : "btn-secondary h-12 w-full"} disabled={busy} onClick={() => fileRef.current?.click()}>
            <ImageUp size={20} {...ICON} aria-hidden /> {failed ? "Try another slip" : msgs.length ? "Upload another slip" : "Upload slip"}
          </button>
        )
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void send([...(e.target.files ?? [])].slice(0, 5));
          e.target.value = "";
        }}
      />
      {msgs.map((m, i) => (
        <Callout key={i} tone={m.tone}>
          {m.text}
        </Callout>
      ))}
      {!busy && msgs.length === 0 && (
        <p className="text-[13px] text-ink-2">Paid in two transfers? Pick both slips at once.</p>
      )}
    </div>
  );
}
