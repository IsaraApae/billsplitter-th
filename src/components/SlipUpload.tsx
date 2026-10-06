"use client";

import { ImageUp, ShieldCheck, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { askConfirm } from "@/lib/client/confirm";
import { compressImage } from "@/lib/client/image";
import { load, save } from "@/lib/client/storage";
import { formatMoney } from "@/lib/money";
import { Callout, ICON, Money } from "./ui";

/** What the slip endpoints answer with when a slip is accepted. */
export interface SlipResult {
  result: "full" | "part";
  amount: number;
  left: number;
  receiver: "match" | "unknown";
  reference: string;
  /** lets this phone remove the slip later */
  undoToken: string;
  /** big bills: the bill the slip is kept with */
  slipAt?: { splitId: string; personId: string };
}

/** A slip uploaded from this phone, kept so the uploader can remove it. */
interface MySlip {
  deleteUrl: string;
  personId: string;
  reference: string;
  undoToken: string;
  amount: number;
  at: string;
}

const KEY = "bs:mySlips";
const loadAll = () => load<Record<string, MySlip[]>>(KEY, {});

/**
 * "Already paid? Upload your slip" — the friend picks their transfer slip,
 * the server reads and checks it, and ticks them if it's good. Slips
 * uploaded from this phone can be removed again (e.g. the wrong picture).
 */
export function SlipUpload<T extends SlipResult>({
  endpoint,
  field,
  personRef,
  currency,
  onAccepted,
  onRemoved,
}: {
  /** e.g. /api/splits/<id>/slip */
  endpoint: string;
  field: "personId" | "personKey";
  personRef: string;
  currency: string;
  onAccepted: (r: T) => void;
  /** after a slip was removed: reload who has paid */
  onRemoved: () => void;
}) {
  const scope = `${endpoint}|${personRef}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [mine, setMine] = useState<MySlip[]>(() => loadAll()[scope] ?? []);

  const keep = (list: MySlip[]) => {
    setMine(list);
    save(KEY, { ...loadAll(), [scope]: list });
  };

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
      keep([
        ...mine,
        {
          deleteUrl: r.slipAt ? `/api/splits/${r.slipAt.splitId}/slip` : endpoint,
          personId: r.slipAt?.personId ?? personRef,
          reference: r.reference,
          undoToken: r.undoToken,
          amount: r.amount,
          at: new Date().toISOString(),
        },
      ]);
      onAccepted(r);
    } catch (e) {
      setMsg({ tone: "error", text: navigator.onLine ? (e as Error).message : "You're offline — try again when connected." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(slip: MySlip) {
    const ok = await askConfirm({
      title: "Remove this slip?",
      message: "Its amount comes off what you've paid, and you can upload it (or the right one) again.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(slip.deleteUrl, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: slip.personId, reference: slip.reference, undoToken: slip.undoToken }),
      });
      const data = await res.json().catch(() => null);
      // Already gone (e.g. the organiser removed it) counts as removed.
      if (!res.ok && res.status !== 404) throw new Error(data?.message ?? "Couldn't remove the slip.");
      keep(mine.filter((s) => s.reference !== slip.reference));
      setMsg({ tone: "success", text: "Slip removed." });
      onRemoved();
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
        <ImageUp size={20} {...ICON} aria-hidden /> {busy ? "Working…" : "Upload slip"}
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
      {mine.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[13px] text-ink-2">Slips you uploaded</p>
          <ul className="space-y-1">
            {mine.map((s) => (
              <li key={s.reference} className="flex min-h-11 items-center justify-between gap-3">
                <span className="text-[15px]">
                  <Money value={s.amount} currency={currency} className="font-semibold" />
                  <span className="text-ink-2">
                    {" · "}
                    {new Date(s.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </span>
                <button type="button" className="btn-ghost min-h-11 px-2 text-[15px]" disabled={busy} onClick={() => remove(s)}>
                  <Trash2 size={18} {...ICON} aria-hidden /> Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
