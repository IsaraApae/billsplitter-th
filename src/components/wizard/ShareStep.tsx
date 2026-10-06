"use client";

import { Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { CalcResult } from "@/lib/calc";
import { useBrowserValue } from "@/lib/client/hooks";
import { formatMoney } from "@/lib/money";
import { splitVersion } from "@/lib/shareVersion";
import type { SplitDoc } from "@/lib/types";
import { ShareButtons } from "../ShareButtons";
import { ICON, Money } from "../ui";

export function ShareStep({ doc, calc, id }: { doc: SplitDoc; calc: CalcResult; id: string }) {
  // ?v= changes when the bill does, so chat apps show a fresh preview after an edit.
  const url = `${useBrowserValue(() => window.location.origin, "")}/s/${id}?v=${splitVersion(doc)}`;
  const total = formatMoney(calc.total, doc.currency);

  return (
    <div className="space-y-6">
      <div className="card px-6 py-8 text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-accent-soft text-accent">
          <Check size={32} {...ICON} />
        </div>
        <h1 className="text-[26px] leading-tight font-bold tracking-tight break-words">{doc.title}</h1>
        <Money value={calc.total} currency={doc.currency} className="mt-2 block text-[40px] leading-none font-bold tracking-tight" />
        <p className="mt-2 text-ink-2">
          {doc.people.length} {doc.people.length === 1 ? "person" : "people"}
        </p>
      </div>

      <div className="card space-y-3.5 p-5">
        <label className="label block" htmlFor="share-url">
          Share this link
        </label>
        <input
          id="share-url"
          readOnly
          className="input font-mono text-[16px]"
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
        <ShareButtons
          url={url}
          title={doc.title}
          text={`${doc.title}: ${total} split ${doc.people.length} ways. Tap to see what you owe and mark it paid.`}
        />
        <Link href={`/s/${id}`} className="btn-ghost w-full">
          Open shared page <ExternalLink size={20} {...ICON} aria-hidden />
        </Link>
      </div>

      <ul className="space-y-1.5 px-5 text-[15px] text-ink-2">
        <li>• Anyone with the link can see the split and tick who has paid.</li>
        <li>• Only this device can edit it. Tap Edit below — the link stays the same.</li>
        <li>• Links expire 90 days after the last activity.</li>
      </ul>
    </div>
  );
}
