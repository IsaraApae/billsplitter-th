"use client";

import { Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { CalcResult } from "@/lib/calc";
import { useBrowserValue } from "@/lib/client/hooks";
import { formatMoney } from "@/lib/money";
import type { SplitDoc } from "@/lib/types";
import { ShareButtons } from "../ShareButtons";
import { Money } from "../ui";

export function ShareStep({ doc, calc, id }: { doc: SplitDoc; calc: CalcResult; id: string }) {
  const url = `${useBrowserValue(() => window.location.origin, "")}/s/${id}`;
  const total = formatMoney(calc.total, doc.currency);

  return (
    <div className="space-y-6">
      <div className="glass rounded-[28px] px-6 py-8 text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_10px_24px_-10px_var(--accent-glow)]">
          <Check size={32} strokeWidth={3} />
        </div>
        <h1 className="text-[26px] leading-tight font-bold tracking-tight break-words">{doc.title}</h1>
        <Money value={calc.total} currency={doc.currency} className="mt-2 block text-[40px] leading-none font-bold tracking-tight" />
        <p className="mt-2 text-[15px] text-ink-2">
          {doc.people.length} {doc.people.length === 1 ? "person" : "people"}
        </p>
      </div>

      <div className="card space-y-3 p-4">
        <label className="label block px-1" htmlFor="share-url">
          Share this link
        </label>
        <input
          id="share-url"
          readOnly
          className="input font-mono text-[14px]"
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
        <ShareButtons
          url={url}
          title={doc.title}
          text={`${doc.title}: ${total} split ${doc.people.length} ways. Tap to see what you owe and mark it paid.`}
        />
        <Link href={`/s/${id}`} className="btn-ghost w-full">
          Open shared page <ExternalLink size={16} aria-hidden />
        </Link>
      </div>

      <ul className="space-y-1.5 px-2 text-[14px] text-ink-2">
        <li>• Anyone with the link can see the split and tick who has paid.</li>
        <li>• Only this device can edit it. Tap Edit below — the link stays the same.</li>
        <li>• Links expire 90 days after the last activity.</li>
      </ul>
    </div>
  );
}
