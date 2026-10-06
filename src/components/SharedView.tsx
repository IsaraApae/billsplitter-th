"use client";

import { Check, ChevronDown, Copy, PartyPopper, Pencil, QrCode, ZoomIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculate, wholeUnit } from "@/lib/calc";
import { useBrowserValue } from "@/lib/client/hooks";
import { photoSrc } from "@/lib/client/photo";
import { getEditToken, getHistory, historyFromDoc, paidProgress, patchHistory } from "@/lib/client/storage";
import { billDate } from "@/lib/draft";
import { ME_ID, organiserFirstByName } from "@/lib/friends";
import { formatStep, wholeUnitName } from "@/lib/money";
import { formatPromptPayId } from "@/lib/promptpay";
import type { SplitDoc } from "@/lib/types";
import { Breakdown } from "./Breakdown";
import { PayQr, type PayQrSource } from "./PayQr";
import { PersonCard } from "./PersonCard";
import { PaidMark, PaymentSheet, type PaidStatus, type PaymentInput, type SlipInfo } from "./Payments";
import { ShareButtons } from "./ShareButtons";
import { SlipUpload, type SlipResult } from "./SlipUpload";
import { ZoomableImage } from "./ZoomableImage";
import { Callout, ICON, Money, Section, Sheet, cx } from "./ui";

const POLL_MS = 10_000;

export function SharedView({
  id,
  doc,
  updatedAt,
  initialPaid,
  initialPartial = {},
  qr,
}: {
  id: string;
  doc: SplitDoc;
  updatedAt: string;
  initialPaid: string[];
  /** part-payments so far: personId → amount */
  initialPartial?: Record<string, number>;
  qr: PayQrSource | null;
}) {
  const router = useRouter();
  const calc = useMemo(() => calculate(doc), [doc]);
  const [paid, setPaid] = useState<Set<string>>(() => new Set(initialPaid));
  const [partial, setPartial] = useState<Record<string, number>>(initialPartial);
  // Person whose payment the organiser is recording.
  const [askFor, setAskFor] = useState<string | null>(null);
  // Slips friends uploaded (organiser only: they show bank names).
  const [slips, setSlips] = useState<Record<string, SlipInfo[]>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const editToken = useBrowserValue(() => getEditToken(id), null);
  const canEdit = !!editToken;
  const url = `${useBrowserValue(() => window.location.origin, "")}/s/${id}`;
  const [payFor, setPayFor] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoBroken, setPhotoBroken] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const version = useRef(updatedAt);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // Progress counts friends only: the organiser paid the bill and never owes themselves.
  const friendIds = doc.people.map((p) => p.id).filter((pid) => pid !== ME_ID);
  const { paid: paidCount, people: total } = paidProgress(
    doc.people.map((p) => p.id),
    [...paid],
  );
  const allPaid = paidCount === total;
  // Only money still coming in (less any part-payments); someone who paid
  // upfront may be owed money back instead.
  const outstanding = calc.people
    .filter((p) => friendIds.includes(p.personId) && !paid.has(p.personId))
    .reduce((s, p) => s + Math.max(0, p.payable - (partial[p.personId] ?? 0)), 0);
  const partCount = friendIds.filter((pid) => !paid.has(pid) && partial[pid]).length;
  const statusOf = (pid: string): PaidStatus => (paid.has(pid) ? "full" : partial[pid] ? "part" : "none");
  // Not the organiser, and not people the organiser owes money back to (they paid upfront).
  const waitingOn = doc.people
    .filter(
      (p) =>
        friendIds.includes(p.id) &&
        !paid.has(p.id) &&
        (calc.people.find((r) => r.personId === p.id)?.payable ?? 0) >= 0,
    )
    .map((p) => p.name);
  const pp = doc.payment.promptpay;
  const payPerson = calc.people.find((p) => p.personId === payFor);
  const askPerson = calc.people.find((p) => p.personId === askFor);

  useEffect(() => {
    version.current = updatedAt;
  }, [updatedAt]);

  // Keep the history entry's progress fresh if this split is in our history.
  useEffect(() => {
    if (getHistory().some((h) => h.id === id))
      patchHistory(id, {
        ...historyFromDoc(doc),
        paid: paidCount,
        people: total,
        total: calc.total,
        paidIds: [...paid],
        partialPaid: partial,
      });
  }, [id, doc, paid, partial, paidCount, total, calc.total]);

  // Bumped to re-load slips (after a poll or an upload).
  const [slipsVersion, setSlipsVersion] = useState(0);
  const loadSlips = useCallback(() => setSlipsVersion((v) => v + 1), []);
  useEffect(() => {
    if (!editToken) return;
    let cancelled = false;
    fetch(`/api/splits/${id}/slips`, { cache: "no-store", headers: { "x-edit-token": editToken } })
      .then((r) => (r.ok ? (r.json() as Promise<{ slips: Record<string, SlipInfo[]> }>) : null))
      .then((d) => !cancelled && d && setSlips(d.slips))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, editToken, slipsVersion]);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible" || pendingRef.current.size > 0) return;
    try {
      const r = await fetch(`/api/splits/${id}/paid`, { cache: "no-store" });
      if (r.status === 404) {
        router.refresh();
        return;
      }
      if (!r.ok) return;
      const data: { paid: string[]; partial?: Record<string, number>; updatedAt: string } = await r.json();
      if (pendingRef.current.size > 0) return; // a tick is in flight; don't clobber it
      setPaid(new Set(data.paid));
      setPartial(data.partial ?? {});
      loadSlips();
      if (data.updatedAt !== version.current) {
        version.current = data.updatedAt;
        router.refresh(); // the creator edited the split — reload the server data
      }
    } catch {
      /* offline: try again next tick */
    }
  }, [id, router, loadSlips]);

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

  /** Paid in full (big tick), part of it (small tick), or not yet — organiser only. */
  async function savePayment(personId: string, input: PaymentInput) {
    if (!canEdit) return;
    setError(null);
    const before = { paid, partial };
    setPaid((s) => {
      const n = new Set(s);
      if ("paid" in input && input.paid) n.add(personId);
      else n.delete(personId);
      return n;
    });
    setPartial((m) => {
      const n = { ...m };
      if ("amount" in input) n[personId] = input.amount;
      else delete n[personId];
      return n;
    });
    setPending((s) => new Set(s).add(personId));
    try {
      const r = await fetch(`/api/splits/${id}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(editToken ? { "x-edit-token": editToken } : {}) },
        body: JSON.stringify({ personId, ...input }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.message ?? "Couldn't save.");
      setPaid(new Set(data.paid as string[]));
      setPartial((data.partial as Record<string, number>) ?? {});
    } catch (e) {
      setPaid(before.paid);
      setPartial(before.partial);
      setError(navigator.onLine ? (e as Error).message : "You're offline — the payment wasn't saved.");
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

  const date = billDate(doc).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 pb-32 md:pb-16">
      <header className="card px-6 pt-6 pb-5 text-center">
        <p className="text-[13px] text-ink-2">{date}</p>
        <h1 className="mt-1 text-[28px] leading-tight font-bold tracking-tight break-words">{doc.title}</h1>
        <Money value={calc.total} currency={doc.currency} className="mt-3 block text-[48px] leading-none font-bold tracking-tight" />
        <p className="mt-2 text-[15px] text-ink-2">
          {doc.people.length} {doc.people.length === 1 ? "person" : "people"} · {doc.mode === "equal" ? "split equally" : "split by item"}
        </p>

        <div className="mt-5 text-left" aria-label="Payment progress">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1.5 font-semibold">
              {allPaid && <PartyPopper size={20} {...ICON} className="text-accent" aria-hidden />}
              {allPaid ? "Everyone has paid" : `${paidCount} of ${total} paid${partCount ? ` · ${partCount} part paid` : ""}`}
            </span>
            {!allPaid && (
              <span className="text-[15px] text-ink-2">
                <Money value={outstanding} currency={doc.currency} className="font-semibold text-ink" /> to go
              </span>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--field)]">
            <div className="h-full rounded-full bg-accent" style={{ width: `${total ? (paidCount / total) * 100 : 0}%` }} />
          </div>
          {!allPaid && waitingOn.length > 0 && (
            <p className="mt-2 text-[15px] text-ink-2">
              Waiting on: <b className="text-ink">{waitingOn.join(", ")}</b>
            </p>
          )}
        </div>
      </header>

      {error && <Callout tone="error">{error}</Callout>}

      {(qr || pp || doc.payment.note) && (
        <Section title="How to pay">
          <div className="card rows" aria-label="How to pay">
            {qr && (
              <div className="flex items-start gap-3 px-5 py-4 text-[15px] text-ink-2">
                <QrCode size={22} {...ICON} className="mt-px shrink-0 text-accent" aria-hidden />
                <p>
                  Tap <b className="text-ink">Pay</b> next to your name for a PromptPay QR
                  {qr.mode === "generate" && " with your exact amount"}.
                </p>
              </div>
            )}
            {pp && (
              <div className="flex min-h-[60px] items-center justify-between gap-2 py-2 pr-3 pl-5">
                <span>
                  <span className="text-ink-2">PromptPay </span>
                  <span className="tnum font-semibold">{formatPromptPayId(pp)}</span>
                </span>
                <button type="button" className="btn-secondary min-h-10 px-4 text-[15px]" onClick={() => copy(pp, "pp")}>
                  {copied === "pp" ? <Check size={18} {...ICON} /> : <Copy size={18} {...ICON} />} {copied === "pp" ? "Copied" : "Copy"}
                </button>
              </div>
            )}
            {doc.payment.note && (
              <div className="flex items-start justify-between gap-2 py-3 pr-3 pl-5">
                <p className="pt-2 break-words whitespace-pre-wrap">{doc.payment.note}</p>
                <button type="button" className="btn-secondary min-h-10 shrink-0 px-4 text-[15px]" onClick={() => copy(doc.payment.note, "note")}>
                  {copied === "note" ? <Check size={18} {...ICON} /> : <Copy size={18} {...ICON} />} {copied === "note" ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="Who owes what">
        <ul className="card rows overflow-hidden" aria-label="People">
          {organiserFirstByName(
            calc.people.map((p, i) => ({ p, profile: doc.people[i] })),
            (x) => x.p.personId,
            (x) => x.p.name,
          ).map(({ p, profile }) => {
            const isPaid = p.personId !== ME_ID && paid.has(p.personId);
            const status = statusOf(p.personId);
            const paidPart = partial[p.personId] ?? 0;
            const busy = pending.has(p.personId);
            return (
              <PersonCard
                key={p.personId}
                person={p}
                profile={profile}
                currency={doc.currency}
                mode={doc.mode}
                highlight={isPaid ? "paid" : "unpaid"}
                leading={
                  p.personId === ME_ID ? (
                    // The organiser paid the bill: nothing to tick.
                    <span className="size-11 shrink-0" aria-hidden />
                  ) : canEdit ? (
                    <button
                      type="button"
                      className="press grid size-11 shrink-0 place-items-center rounded-full"
                      disabled={busy}
                      aria-label={`${p.name}: ${status === "full" ? "paid" : status === "part" ? "paid part" : "not paid"}. Change`}
                      onClick={() => setAskFor(p.personId)}
                    >
                      <PaidMark status={status} busy={busy} />
                    </button>
                  ) : (
                    // Read-only for everyone but the organiser: a status icon, not a control.
                    <span className="grid size-11 shrink-0 place-items-center" aria-hidden>
                      {status === "none" ? <span className="size-2.5 rounded-full bg-warn" /> : <PaidMark status={status} />}
                    </span>
                  )
                }
                badge={
                  <span
                    className={cx(
                      "text-[13px] font-semibold",
                      p.personId === ME_ID
                        ? "text-ink-2"
                        : isPaid || status === "part"
                          ? "text-accent"
                          : p.payable < 0
                            ? "text-positive"
                            : "text-warn",
                    )}
                  >
                    {p.personId === ME_ID ? (
                      "Organiser"
                    ) : p.payable < 0 ? (
                      isPaid ? (
                        "Paid back"
                      ) : (
                        "Gets money back"
                      )
                    ) : isPaid ? (
                      "Paid"
                    ) : status === "part" ? (
                      <>
                        Paid <Money value={paidPart} currency={doc.currency} /> ·{" "}
                        <Money value={Math.max(0, p.payable - paidPart)} currency={doc.currency} /> left
                      </>
                    ) : (
                      "Unpaid"
                    )}
                  </span>
                }
                action={
                  !isPaid && p.payable > 0 && p.personId !== ME_ID ? (
                    <button type="button" className="chip-accent min-h-10 px-4" onClick={() => setPayFor(p.personId)}>
                      Pay
                    </button>
                  ) : null
                }
              />
            );
          })}
        </ul>
        {calc.people.some((p) => p.payable !== p.total - p.prepaid) && (
          <p className="px-5 text-[13px] text-ink-2">
            Amounts are rounded to whole {wholeUnitName(doc.currency)}:{" "}
            {doc.mode === "equal" ? (
              "every friend pays the same, their share rounded up"
            ) : (
              <>
                friends within {formatStep(wholeUnit(doc.currency), doc.currency)} of their exact shares (some up, some
                down)
              </>
            )}
            , the organiser&apos;s to the nearest {formatStep(wholeUnit(doc.currency), doc.currency)}
            {calc.roundingExtra > 0 && (
              <>
                ; together that&apos;s <Money value={calc.roundingExtra} currency={doc.currency} /> more for{" "}
                {doc.people.find((p) => p.id === ME_ID)?.name ?? "whoever paid the bill"}
              </>
            )}
            .
          </p>
        )}
        <p className="px-5 text-[13px] text-ink-2">
          {canEdit
            ? "Tick the circle when someone has paid you. Everyone with the link sees it."
            : "The organiser ticks people off as they receive payments."}
        </p>
      </Section>

      <Section title="Bill">
        {doc.photo && !photoBroken && (
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            className="card relative block w-full overflow-hidden p-0 text-left"
            aria-label="Open the receipt photo"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoSrc(doc.photo)}
              alt="Receipt"
              loading="lazy"
              className="h-44 w-full object-cover object-top"
              onError={() => setPhotoBroken(true)}
            />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/65 to-transparent px-5 pt-10 pb-4 text-[15px] font-semibold text-white">
              Receipt photo
              <ZoomIn size={22} {...ICON} aria-hidden />
            </span>
          </button>
        )}
        <details className="card group">
          <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between px-5 font-semibold">
            All items ({doc.items.length})
            <ChevronDown size={20} {...ICON} aria-hidden className="text-ink-3 group-open:rotate-180" />
          </summary>
          <ul className="space-y-1.5 px-5 pb-4 text-[15px]">
            {calc.lines.map((l, i) => (
              <li key={l.itemId} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {doc.items[i].qty > 1 && <span className="text-ink-2">{doc.items[i].qty}× </span>}
                  {l.name}
                </span>
                <Money value={l.lineTotal} currency={doc.currency} tone={l.lineTotal < 0 ? "negative" : undefined} />
              </li>
            ))}
          </ul>
        </details>
        <Breakdown doc={doc} calc={calc} />
      </Section>

      <section className="space-y-2.5">
        <ShareButtons url={url} title={doc.title} text={`${doc.title} — see what you owe`} />
        {canEdit && (
          <Link href={`/?edit=${id}`} className="btn-secondary h-12 w-full">
            <Pencil size={20} {...ICON} aria-hidden /> Edit this split
          </Link>
        )}
        <Link href="/" className="btn-ghost w-full">
          Make your own split
        </Link>
      </section>

      {doc.photo && (
        <Sheet open={photoOpen} onClose={() => setPhotoOpen(false)} title="Receipt">
          <ZoomableImage src={photoSrc(doc.photo)} />
        </Sheet>
      )}

      {canEdit && (
        <PaymentSheet
          open={!!askPerson}
          onClose={() => setAskFor(null)}
          name={askPerson?.name ?? ""}
          owed={askPerson?.payable ?? 0}
          currency={doc.currency}
          status={askPerson ? statusOf(askPerson.personId) : "none"}
          paidSoFar={askPerson ? (partial[askPerson.personId] ?? 0) : 0}
          slips={askPerson ? slips[askPerson.personId] : undefined}
          onSave={(input) => askPerson && savePayment(askPerson.personId, input)}
        />
      )}

      <Sheet open={!!payPerson} onClose={() => setPayFor(null)} title={payPerson ? `Pay ${payPerson.name}'s share` : "Pay"}>
        {payPerson && (
          <div className="space-y-4">
            {qr && doc.currency === "THB" && (
              // What's still left after any part-payment.
              <PayQr
                source={qr}
                amount={Math.max(0, payPerson.payable - (partial[payPerson.personId] ?? 0))}
                name={payPerson.name}
              />
            )}
            <SlipUpload<SlipResult & { paid: string[]; partial: Record<string, number> }>
              endpoint={`/api/splits/${id}/slip`}
              field="personId"
              personRef={payPerson.personId}
              currency={doc.currency}
              onAccepted={(r) => {
                setPaid(new Set(r.paid));
                setPartial(r.partial ?? {});
                loadSlips();
              }}
            />
          </div>
        )}
      </Sheet>
    </main>
  );
}
