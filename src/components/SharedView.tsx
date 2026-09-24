"use client";

import { Check, Copy, Pencil, QrCode } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculate, wholeUnit } from "@/lib/calc";
import { useBrowserValue } from "@/lib/client/hooks";
import { getEditToken, getHistory, patchHistory } from "@/lib/client/storage";
import { ME_ID } from "@/lib/friends";
import { formatStep, wholeUnitName } from "@/lib/money";
import { formatPromptPayId } from "@/lib/promptpay";
import type { SplitDoc } from "@/lib/types";
import { Breakdown } from "./Breakdown";
import { PayQr, type PayQrSource } from "./PayQr";
import { PersonCard } from "./PersonCard";
import { ShareButtons } from "./ShareButtons";
import { Callout, Money, Sheet, cx } from "./ui";

const POLL_MS = 10_000;

export function SharedView({
  id,
  doc,
  updatedAt,
  initialPaid,
  qr,
}: {
  id: string;
  doc: SplitDoc;
  updatedAt: string;
  initialPaid: string[];
  qr: PayQrSource | null;
}) {
  const router = useRouter();
  const calc = useMemo(() => calculate(doc), [doc]);
  const [paid, setPaid] = useState<Set<string>>(() => new Set(initialPaid));
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const editToken = useBrowserValue(() => getEditToken(id), null);
  const canEdit = !!editToken;
  const url = `${useBrowserValue(() => window.location.origin, "")}/s/${id}`;
  const [payFor, setPayFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const version = useRef(updatedAt);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const paidCount = doc.people.filter((p) => paid.has(p.id)).length;
  const total = doc.people.length;
  const allPaid = paidCount === total;
  const outstanding = calc.people.filter((p) => !paid.has(p.personId)).reduce((s, p) => s + p.payable, 0);
  const pp = doc.payment.promptpay;
  const payPerson = calc.people.find((p) => p.personId === payFor);

  useEffect(() => {
    version.current = updatedAt;
  }, [updatedAt]);

  // Keep the history entry's progress fresh if this split is in our history.
  useEffect(() => {
    if (getHistory().some((h) => h.id === id)) patchHistory(id, { paid: paidCount, people: total, total: calc.total });
  }, [id, paidCount, total, calc.total]);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible" || pendingRef.current.size > 0) return;
    try {
      const r = await fetch(`/api/splits/${id}/paid`, { cache: "no-store" });
      if (r.status === 404) {
        router.refresh();
        return;
      }
      if (!r.ok) return;
      const data: { paid: string[]; updatedAt: string } = await r.json();
      if (pendingRef.current.size > 0) return; // a tick is in flight; don't clobber it
      setPaid(new Set(data.paid));
      if (data.updatedAt !== version.current) {
        version.current = data.updatedAt;
        router.refresh(); // the creator edited the split — reload the server data
      }
    } catch {
      /* offline: try again next tick */
    }
  }, [id, router]);

  useEffect(() => {
    const t = setInterval(refresh, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  async function togglePaid(personId: string) {
    const next = !paid.has(personId);
    if (!next && !canEdit) return; // only the organiser can undo a payment
    setError(null);
    const flip = (s: Set<string>, on: boolean) => {
      const n = new Set(s);
      if (on) n.add(personId);
      else n.delete(personId);
      return n;
    };
    setPaid((s) => flip(s, next));
    setPending((s) => new Set(s).add(personId));
    try {
      const r = await fetch(`/api/splits/${id}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(editToken ? { "x-edit-token": editToken } : {}) },
        body: JSON.stringify({ personId, paid: next }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.message ?? "Couldn't save.");
      setPaid(new Set(data.paid as string[]));
    } catch (e) {
      setPaid((s) => flip(s, !next));
      setError(navigator.onLine ? (e as Error).message : "You're offline — the tick wasn't saved.");
    } finally {
      setPending((s) => {
        const n = new Set(s);
        n.delete(personId);
        return n;
      });
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  const date = new Date(doc.createdAt).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 pt-5 pb-16">
      <header className="glass rounded-[28px] px-6 pt-6 pb-5 text-center">
        <p className="text-[13px] font-medium text-ink-2">{date}</p>
        <h1 className="mt-1 text-[28px] leading-tight font-bold tracking-tight break-words">{doc.title}</h1>
        <Money value={calc.total} currency={doc.currency} className="mt-3 block text-[48px] leading-none font-bold tracking-tight" />
        <p className="mt-2 text-[14px] text-ink-2">
          {total} {total === 1 ? "person" : "people"} · {doc.mode === "equal" ? "split equally" : "split by item"}
        </p>

        <div className="mt-5 text-left" aria-label="Payment progress">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="font-semibold">{allPaid ? "🎉 Everyone has paid" : `${paidCount} of ${total} paid`}</span>
            {!allPaid && (
              <span className="text-[14px] font-semibold text-warn">
                <Money value={outstanding} currency={doc.currency} /> to go
              </span>
            )}
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[var(--hover)] shadow-[inset_0_0_0_1px_var(--line)]">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700 ease-spring motion-reduce:transition-none"
              style={{ width: `${total ? (paidCount / total) * 100 : 0}%` }}
            />
          </div>
          {!allPaid && (
            <p className="mt-2 text-[14px] text-ink-2">
              Waiting on:{" "}
              <b className="text-ink">
                {doc.people
                  .filter((p) => !paid.has(p.id))
                  .map((p) => p.name)
                  .join(", ")}
              </b>
            </p>
          )}
        </div>
      </header>

      {error && <Callout tone="error">{error}</Callout>}

      {(qr || pp || doc.payment.note) && (
        <section className="card space-y-3 p-4" aria-label="How to pay">
          <h2 className="px-1 font-bold">How to pay</h2>
          {qr && (
            <div className="flex items-start gap-2 px-1 text-[14px] text-ink-2">
              <QrCode size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <p>
                Tap <b className="text-ink">Pay</b> next to your name for a PromptPay QR
                {qr.mode === "generate" && " with your exact amount"}.
              </p>
            </div>
          )}
          {pp && (
            <div className="flex min-h-11 items-center justify-between gap-2 px-1">
              <span>
                <span className="text-[14px] text-ink-2">PromptPay </span>
                <span className="tnum font-semibold">{formatPromptPayId(pp)}</span>
              </span>
              <button type="button" className="btn-secondary min-h-10 px-4 text-[14px]" onClick={() => copy(pp, "pp")}>
                {copied === "pp" ? <Check size={16} /> : <Copy size={16} />} {copied === "pp" ? "Copied" : "Copy"}
              </button>
            </div>
          )}
          {doc.payment.note && (
            <div className="flex items-start justify-between gap-2 px-1">
              <p className="pt-2 text-[15px] break-words whitespace-pre-wrap">{doc.payment.note}</p>
              <button
                type="button"
                className="btn-secondary min-h-10 shrink-0 px-4 text-[14px]"
                onClick={() => copy(doc.payment.note, "note")}
              >
                {copied === "note" ? <Check size={16} /> : <Copy size={16} />} {copied === "note" ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </section>
      )}

      <section aria-label="People" className="space-y-3">
        <h2 className="px-1 text-[20px] font-bold">Who owes what</h2>
        <ul className="space-y-2.5">
          {calc.people.map((p, i) => {
            const isPaid = paid.has(p.personId);
            const busy = pending.has(p.personId);
            return (
              <PersonCard
                key={p.personId}
                person={p}
                profile={doc.people[i]}
                currency={doc.currency}
                mode={doc.mode}
                highlight={isPaid ? "paid" : "unpaid"}
                leading={
                  <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={isPaid}
                      disabled={busy || (isPaid && !canEdit)}
                      onChange={() => togglePaid(p.personId)}
                      aria-label={`${p.name} paid`}
                      title={isPaid && !canEdit ? "Only the organiser can undo a payment" : undefined}
                    />
                    <span
                      aria-hidden
                      className={cx(
                        "grid size-8 place-items-center rounded-full transition-[background-color,transform] duration-300 ease-spring peer-focus-visible:ring-4 peer-focus-visible:ring-accent/30 peer-active:scale-90",
                        isPaid ? "bg-accent text-accent-ink" : "shadow-[inset_0_0_0_2px_var(--field-border)]",
                        busy && "opacity-50",
                      )}
                    >
                      {isPaid && <Check size={18} strokeWidth={3} />}
                    </span>
                  </label>
                }
                badge={
                  <span className={cx("text-[12px] font-bold", isPaid ? "text-accent" : "text-warn")}>
                    {p.personId === ME_ID ? (isPaid ? "Paid" : "Organiser") : isPaid ? "Paid" : "Unpaid"}
                  </span>
                }
                action={
                  qr && !isPaid && p.payable > 0 && doc.currency === "THB" && p.personId !== ME_ID ? (
                    <button type="button" className="btn-primary min-h-10 px-4 text-[14px]" onClick={() => setPayFor(p.personId)}>
                      Pay
                    </button>
                  ) : null
                }
              />
            );
          })}
        </ul>
        {calc.people.some((p) => p.payable !== p.total) && (
          <p className="px-1 text-[13px] text-ink-2">
            Amounts are rounded to whole {wholeUnitName(doc.currency)}{" "}
            (some up, some down, within {formatStep(wholeUnit(doc.currency), doc.currency)} of each exact share)
            {calc.roundingExtra > 0 && (
              <>
                ; together that&apos;s <Money value={calc.roundingExtra} currency={doc.currency} /> more for{" "}
                {doc.people.find((p) => p.id === ME_ID)?.name ?? "whoever paid the bill"}
              </>
            )}
            .
          </p>
        )}
        <p className="px-1 text-[13px] text-ink-2">
          Tick the circle when someone has paid. Everyone with the link sees it.{" "}
          {canEdit ? "As the organiser, you can also untick it." : "Only the organiser can undo a tick."}
        </p>
      </section>

      <section className="space-y-3" aria-label="Bill breakdown">
        <h2 className="px-1 text-[20px] font-bold">Bill</h2>
        <details className="card group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 font-semibold">
            All items ({doc.items.length})
            <span aria-hidden className="text-ink-3 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <ul className="space-y-1.5 border-t border-line px-4 py-3 text-[14px]">
            {calc.lines.map((l, i) => (
              <li key={l.itemId} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {doc.items[i].qty > 1 && <span className="text-ink-2">{doc.items[i].qty}× </span>}
                  {l.name}
                </span>
                <Money value={l.lineTotal} currency={doc.currency} />
              </li>
            ))}
          </ul>
        </details>
        <Breakdown doc={doc} calc={calc} />
      </section>

      <section className="space-y-2">
        <ShareButtons url={url} title={doc.title} text={`${doc.title} — see what you owe`} />
        {canEdit && (
          <Link href={`/?edit=${id}`} className="btn-secondary h-12 w-full">
            <Pencil size={16} aria-hidden /> Edit this split
          </Link>
        )}
        <Link href="/" className="btn-ghost w-full">
          Make your own split
        </Link>
      </section>

      <Sheet open={!!payPerson} onClose={() => setPayFor(null)} title={payPerson ? `Pay ${payPerson.name}'s share` : "Pay"}>
        {payPerson && qr && <PayQr source={qr} amount={payPerson.payable} name={payPerson.name} />}
      </Sheet>
    </main>
  );
}
