"use client";

import Link from "next/link";
import type { CalcResult } from "@/lib/calc";
import { useBrowserValue } from "@/lib/client/hooks";
import { formatMoney } from "@/lib/money";
import type { SplitDoc } from "@/lib/types";
import { ShareButtons } from "../ShareButtons";

export function ShareStep({ doc, calc, id }: { doc: SplitDoc; calc: CalcResult; id: string }) {
  const url = `${useBrowserValue(() => window.location.origin, "")}/s/${id}`;
  const total = formatMoney(calc.total, doc.currency);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-3 grid size-16 place-items-center rounded-full bg-emerald-100 text-3xl dark:bg-emerald-950">
          ✓
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{doc.title}</h1>
        <p className="text-zinc-500">
          {total} · {doc.people.length} {doc.people.length === 1 ? "person" : "people"}
        </p>
      </div>

      <div className="card space-y-3 p-4">
        <label className="label block" htmlFor="share-url">
          Share this link
        </label>
        <input
          id="share-url"
          readOnly
          className="input font-mono text-sm"
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
        <ShareButtons
          url={url}
          title={doc.title}
          text={`${doc.title}: ${total} split ${doc.people.length} ways. Tap to see what you owe and mark it paid.`}
        />
        <Link href={`/s/${id}`} className="btn-ghost w-full">
          Open shared page →
        </Link>
      </div>

      <ul className="space-y-1 px-1 text-sm text-zinc-500">
        <li>• Anyone with the link can see the split and tick who has paid.</li>
        <li>• Only this device can edit it. Tap Edit below to change anything; the link stays the same.</li>
        <li>• Links expire 90 days after the last activity.</li>
      </ul>
    </div>
  );
}
