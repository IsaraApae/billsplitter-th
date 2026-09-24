"use client";

import { ChevronRight, QrCode } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { CalcResult } from "@/lib/calc";
import { getProfile, qrImageUrl } from "@/lib/client/profile";
import { formatPromptPayId, isValidPromptPayId } from "@/lib/promptpay";
import type { SplitDoc } from "@/lib/types";
import { Breakdown } from "../Breakdown";
import { PersonCard } from "../PersonCard";
import { Callout, Money, Section } from "../ui";
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
    <div className="space-y-7">
      <div>
        <h1 className="large-title">Review</h1>
        <input
          className="input mt-4 text-[17px] font-semibold"
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
        {printedTotal !== null && printedTotal !== calc.total && (
          <Callout tone="warn">
            The receipt&apos;s printed total is <Money value={printedTotal} currency={doc.currency} /> but this split comes
            to <Money value={calc.total} currency={doc.currency} />. Check the items and the service charge / VAT settings.
          </Callout>
        )}
      </Section>

      {doc.people.length > 0 && (
        <Section title={`Per person · ${doc.people.length}`}>
          <ul className="space-y-2.5">
            {calc.people.map((p, i) => (
              <PersonCard key={p.personId} person={p} profile={doc.people[i]} currency={doc.currency} mode={doc.mode} />
            ))}
          </ul>
          <p className="px-1 text-[13px] text-ink-2">
            Totals add up exactly to <Money value={calc.total} currency={doc.currency} />; leftover satang/cents from
            rounding are spread one at a time.
          </p>
        </Section>
      )}

      <Section title="How you get paid">
        <Link href="/me" className="card flex min-h-16 items-center gap-3 p-3 pl-4">
          {profile.qrMode === "upload" && profile.ownerId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImageUrl(profile.ownerId, profile.qrVersion)} alt="" className="size-12 rounded-lg bg-white object-contain p-1" />
          ) : (
            <span className="grid size-12 place-items-center rounded-lg bg-accent-soft text-accent-strong">
              <QrCode size={24} aria-hidden />
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
          <ChevronRight size={18} className="text-ink-3" aria-hidden />
        </Link>
      </Section>
    </div>
  );
}
