"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculate } from "@/lib/calc";
import { useBrowserValue } from "@/lib/client/hooks";
import { getEditToken, getHistory, patchHistory } from "@/lib/client/storage";
import { formatMoney } from "@/lib/money";
import { isValidPromptPayId } from "@/lib/promptpay";
import type { SplitDoc } from "@/lib/types";
import { Breakdown } from "./Breakdown";
import { PersonCard } from "./PersonCard";
import { PromptPayQR } from "./PromptPayQR";
import { ShareButtons } from "./ShareButtons";
import { Callout, cx } from "./ui";

const POLL_MS = 10_000;

function formatPromptPay(id: string) {
  if (/^0\d{9}$/.test(id)) return `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;
  return id;
}

export function SharedView({
  id,
  doc,
  updatedAt,
  initialPaid,
}: {
  id: string;
  doc: SplitDoc;
  updatedAt: string;
  initialPaid: string[];
}) {
  const router = useRouter();
  const calc = useMemo(() => calculate(doc), [doc]);
  const [paid, setPaid] = useState<Set<string>>(() => new Set(initialPaid));
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const canEdit = useBrowserValue(() => !!getEditToken(id), false);
  const url = `${useBrowserValue(() => window.location.origin, "")}/s/${id}`;
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const version = useRef(updatedAt);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const f = (n: number) => formatMoney(n, doc.currency);
  const paidCount = doc.people.filter((p) => paid.has(p.id)).length;
  const total = doc.people.length;
  const allPaid = paidCount === total;
  const pp = doc.payment.promptpay;
  const showQr = doc.currency === "THB" && isValidPromptPayId(pp);

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
    setError(null);
    setPaid((s) => {
      const n = new Set(s);
      if (next) n.add(personId);
      else n.delete(personId);
      return n;
    });
    setPending((s) => new Set(s).add(personId));
    try {
      const r = await fetch(`/api/splits/${id}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, paid: next }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.message ?? "Couldn't save.");
      setPaid(new Set(data.paid as string[]));
    } catch (e) {
      setPaid((s) => {
        const n = new Set(s);
        if (next) n.delete(personId);
        else n.add(personId);
        return n;
      });
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
    <main className="mx-auto max-w-2xl space-y-6 px-4 pt-4 pb-16">
      <header className="text-center">
        <p className="text-sm text-zinc-500">{date}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight break-words">{doc.title}</h1>
        <p className="mt-2 text-4xl font-bold tabular-nums">{f(calc.total)}</p>
        <p className="text-sm text-zinc-500">
          {total} {total === 1 ? "person" : "people"} · {doc.mode === "equal" ? "split equally" : "split by item"}
        </p>
      </header>

      <section aria-label="Payment progress" className="card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-semibold">
            {allPaid ? "🎉 Everyone has paid" : `${paidCount} of ${total} paid`}
          </span>
          {!allPaid && (
            <span className="text-sm text-amber-700 dark:text-amber-400">
              {f(calc.people.filter((p) => !paid.has(p.personId)).reduce((s, p) => s + p.total, 0))} outstanding
            </span>
          )}
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${total ? (paidCount / total) * 100 : 0}%` }}
          />
        </div>
        {!allPaid && (
          <p className="mt-2 text-sm text-zinc-500">
            Waiting on:{" "}
            <b className="text-zinc-800 dark:text-zinc-200">
              {doc.people.filter((p) => !paid.has(p.id)).map((p) => p.name).join(", ")}
            </b>
          </p>
        )}
      </section>

      {error && <Callout tone="error">{error}</Callout>}

      {(pp || doc.payment.note) && (
        <section className="card space-y-2 p-4" aria-label="How to pay">
          <h2 className="font-semibold">How to pay</h2>
          {pp && (
            <div className="flex items-center justify-between gap-2">
              <span>
                <span className="text-sm text-zinc-500">PromptPay </span>
                <span className="font-mono font-semibold">{formatPromptPay(pp)}</span>
              </span>
              <button type="button" className="btn-secondary min-h-9 px-3 text-sm" onClick={() => copy(pp, "pp")}>
                {copied === "pp" ? "✓ Copied" : "Copy"}
              </button>
            </div>
          )}
          {doc.payment.note && (
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm break-words whitespace-pre-wrap">{doc.payment.note}</p>
              <button
                type="button"
                className="btn-secondary min-h-9 shrink-0 px-3 text-sm"
                onClick={() => copy(doc.payment.note, "note")}
              >
                {copied === "note" ? "✓ Copied" : "Copy"}
              </button>
            </div>
          )}
          {showQr && <p className="text-xs text-zinc-500">Tap your name below for a PromptPay QR with your exact amount.</p>}
        </section>
      )}

      <section aria-label="People" className="space-y-2">
        <h2 className="px-1 text-lg font-bold">Who owes what</h2>
        <ul className="space-y-2">
          {calc.people.map((p) => {
            const isPaid = paid.has(p.personId);
            const busy = pending.has(p.personId);
            return (
              <PersonCard
                key={p.personId}
                person={p}
                currency={doc.currency}
                mode={doc.mode}
                highlight={isPaid ? "paid" : "unpaid"}
                leading={
                  <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={isPaid}
                      disabled={busy}
                      onChange={() => togglePaid(p.personId)}
                      aria-label={`${p.name} paid`}
                    />
                    <span
                      aria-hidden
                      className={cx(
                        "grid size-8 place-items-center rounded-lg border-2 text-lg font-bold transition peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500",
                        isPaid
                          ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-zinc-950"
                          : "border-zinc-300 dark:border-zinc-600",
                        busy && "opacity-50",
                      )}
                    >
                      {isPaid ? "✓" : ""}
                    </span>
                  </label>
                }
                badge={
                  isPaid ? (
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Paid</span>
                  ) : (
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Not paid yet</span>
                  )
                }
                footer={
                  showQr && !isPaid && p.total > 0 ? (
                    <div className="mt-3">
                      {qrFor === p.personId ? (
                        <PromptPayQR id={pp} amount={p.total} name={p.name} />
                      ) : (
                        <button type="button" className="btn-primary w-full" onClick={() => setQrFor(p.personId)}>
                          Pay {f(p.total)} with PromptPay QR
                        </button>
                      )}
                    </div>
                  ) : null
                }
              />
            );
          })}
        </ul>
        <p className="px-1 text-xs text-zinc-500">Tick the box when someone has paid. Everyone with the link sees it.</p>
      </section>

      <section className="space-y-2" aria-label="Bill breakdown">
        <h2 className="px-1 text-lg font-bold">Bill</h2>
        <details className="card group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 font-medium">
            All items ({doc.items.length})
            <span aria-hidden className="text-zinc-400 transition group-open:rotate-180">
              ▾
            </span>
          </summary>
          <ul className="space-y-1 border-t border-zinc-100 px-4 py-3 text-sm dark:border-zinc-800">
            {calc.lines.map((l, i) => (
              <li key={l.itemId} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {doc.items[i].qty > 1 && <span className="text-zinc-500">{doc.items[i].qty}× </span>}
                  {l.name}
                </span>
                <span className="tabular-nums">{f(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
        </details>
        <Breakdown doc={doc} calc={calc} />
      </section>

      <section className="space-y-2">
        <ShareButtons url={url} title={doc.title} text={`${doc.title}: ${f(calc.total)} — see what you owe`} />
        {canEdit && (
          <Link href={`/?edit=${id}`} className="btn-secondary w-full">
            ✎ Edit this split
          </Link>
        )}
        <Link href="/" className="btn-ghost w-full">
          Make your own split
        </Link>
      </section>
    </main>
  );
}
