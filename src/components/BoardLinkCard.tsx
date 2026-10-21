"use client";

import { Check, Copy, ExternalLink, Share } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { claimMySplits } from "@/lib/client/claim";
import { useBrowserValue } from "@/lib/client/hooks";
import { getDeviceKey, load, save } from "@/lib/client/storage";
import { ICON, Section } from "./ui";

const BOARD = "bs:board";

/**
 * "Share the list": one link anyone can open to see everyone who still owes
 * you, A–Z, with their unpaid bills. Shown on "Owed to you".
 */
export function BoardLinkCard({ name }: { name: string }) {
  const [id, setId] = useState<string | null>(() => load<string | null>(BOARD, null));
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const canShare = useBrowserValue(() => typeof navigator.share === "function", false);
  // Changes each visit, so the preview shows today's amounts.
  const [v] = useState(() => Date.now().toString(36));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Make sure every bill in History is on the list first.
      await claimMySplits(true);
      try {
        const r = await fetch("/api/boards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner: getDeviceKey() }),
        });
        if (!r.ok) throw new Error();
        const { id: fresh } = (await r.json()) as { id: string };
        save(BOARD, fresh);
        if (!cancelled) setId(fresh);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const url = id ? `${window.location.origin}/o/${id}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Older or insecure contexts: copy through a hidden text field.
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <Section title="Share the list">
      <div className="card space-y-3 p-4">
        {id ? (
          <>
            <Link href={`/o/${id}`} className="block overflow-hidden rounded-[18px] border border-[var(--line)]" aria-label="Open the list">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/og/o/${id}?v=${v}`} alt={`Owed to ${name}`} className="aspect-[1200/630] w-full bg-[var(--field)] object-cover" />
            </Link>
            <button
              type="button"
              onClick={copy}
              className="flex min-h-12 w-full items-center gap-2 rounded-full bg-[var(--field)] py-2 pr-2 pl-4 text-left"
              aria-label="Copy the link"
            >
              <span className="tnum min-w-0 flex-1 truncate font-mono text-[14px]">{url.replace(/^https?:\/\//, "")}</span>
              <span className="chip-accent min-h-9 shrink-0 px-3 text-[14px]">
                {copied ? <Check size={16} {...ICON} /> : <Copy size={16} {...ICON} />} {copied ? "Copied" : "Copy"}
              </span>
            </button>
            {canShare && (
              <button
                type="button"
                className="btn-primary h-12 w-full"
                onClick={() =>
                  navigator.share({ title: `Owed to ${name}`, text: `Owed to ${name} — who still has to pay`, url }).catch(() => {})
                }
              >
                <Share size={20} {...ICON} aria-hidden /> Share
              </button>
            )}
            <Link href={`/o/${id}`} className="flex items-center justify-center gap-1 py-1 text-[15px] font-semibold text-accent">
              Open the list <ExternalLink size={16} {...ICON} aria-hidden />
            </Link>
          </>
        ) : (
          <p className="py-3 text-center text-[15px] text-ink-2">{error ? "Couldn't make the link — try again later." : "Making your link…"}</p>
        )}
        <p className="text-[13px] text-ink-2">
          Anyone with this link sees everyone who still owes you, A–Z, with their unpaid bills. It stays the same
          link and updates by itself.
        </p>
      </div>
    </Section>
  );
}
