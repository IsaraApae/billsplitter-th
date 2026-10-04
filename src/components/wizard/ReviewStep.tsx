"use client";

import { ChevronRight, QrCode } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { CalcResult } from "@/lib/calc";
import { getProfile, qrImageUrl } from "@/lib/client/profile";
import { totalMismatch } from "@/lib/draft";
import { wholeUnitName } from "@/lib/money";
import { formatPromptPayId, isValidPromptPayId } from "@/lib/promptpay";
import type { SplitDoc } from "@/lib/types";
import { Breakdown } from "../Breakdown";
import { PersonCard } from "../PersonCard";
import { Callout, ICON, Money, Section } from "../ui";
import type { SetDoc } from "./Wizard";

export function ReviewStep({
  doc,
  setDoc,
  calc,
  goTo,
}: {
  doc: SplitDoc;
  setDoc: SetDoc;
  calc: CalcResult;
  goTo: (step: number) => void;
}) {
  const [profile] = useState(getProfile);
  const printedTotal = doc.receipt.total;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="large-title">Review</h1>
        <input
          className="input mt-3.5 font-semibold"
          placeholder="Title, e.g. Friday dinner"
          aria-label="Split title"
          maxLength={80}
          value={doc.title}
          onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))}
        />
      </div>

      {doc.people.length === 0 ? (
        <Callout tone="warn">
          Add at least one person.{" "}
          <button type="button" className="font-bold underline" onClick={() => goTo(1)}>
            Add people
          </button>
        </Callout>
      ) : calc.unassignedItemIds.length > 0 ? (
        <Callout tone="warn">
          <b>{calc.unassignedItemIds.length} item(s) aren&apos;t assigned</b>, so the split can&apos;t be finished yet.{" "}
          <button type="button" className="font-bold underline" onClick={() => goTo(1)}>
            Assign items
          </button>
        </Callout>
      ) : null}

      <Section title="Breakdown">
        <Breakdown doc={doc} calc={calc} />
        {totalMismatch(calc.total, printedTotal, doc.currency) !== null && printedTotal !== null && (
          <Callout tone="warn">
            The receipt&apos;s printed total is <Money value={printedTotal} currency={doc.currency} /> but this split comes
            to <Money value={calc.total} currency={doc.currency} />. Check the items and the service charge / VAT settings.
          </Callout>
        )}
      </Section>

      {doc.people.length > 0 && (
        <Section title={`Per person · ${doc.people.length}`}>
          <ul className="card rows overflow-hidden">
            {calc.people.map((p, i) => (
              <PersonCard key={p.personId} person={p} profile={doc.people[i]} currency={doc.currency} mode={doc.mode} />
            ))}
          </ul>
          <p className="px-5 text-[13px] text-ink-2">
            {doc.roundUp ? (
              <>
                Friends pay whole {wholeUnitName(doc.currency)} amounts; together
                they never pay less than their exact shares, so you never lose money
                {calc.roundingExtra > 0 && (
                  <>
                    {" "}— your share is <Money value={calc.roundingExtra} currency={doc.currency} className="text-positive" /> lower
                  </>
                )}
                .
              </>
            ) : (
              <>
                Totals add up exactly to <Money value={calc.total} currency={doc.currency} />; leftover satang/cents
                from rounding are spread one at a time. Turn on Rounding in Extras for whole amounts.
              </>
            )}
          </p>
        </Section>
      )}

      <Section title="How you get paid">
        <Link href="/me" className="card flex min-h-[68px] items-center gap-3 py-3 pr-4 pl-5">
          {profile.qrMode === "upload" && profile.ownerId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImageUrl(profile.ownerId, profile.qrVersion)} alt="" className="size-12 rounded-[14px] bg-white object-contain p-1" />
          ) : (
            <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent-strong">
              <QrCode size={22} {...ICON} aria-hidden />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              {profile.qrMode === "upload" && profile.ownerId
                ? "Your PromptPay QR"
                : profile.qrMode === "generate" && isValidPromptPayId(profile.promptpay)
                  ? `PromptPay ${formatPromptPayId(profile.promptpay)}`
                  : "No QR set up"}
            </span>
            <span className="block truncate text-[13px] text-ink-2">
              {profile.qrMode === "generate" && isValidPromptPayId(profile.promptpay)
                ? doc.currency === "THB"
                  ? "Each person's QR includes their amount"
                  : "QR only works for THB splits"
                : profile.note || "Add your QR or bank details in Me"}
            </span>
          </span>
          <ChevronRight size={20} {...ICON} className="text-ink-3" aria-hidden />
        </Link>
      </Section>
    </div>
  );
}
