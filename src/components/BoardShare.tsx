"use client";

import Link from "next/link";
import { useBrowserValue } from "@/lib/client/hooks";
import { ShareButtons } from "./ShareButtons";

/** Share / Copy link for a "who still owes" list. */
export function BoardShare({ id, title }: { id: string; title: string }) {
  const url = `${useBrowserValue(() => window.location.origin, "")}/o/${id}`;
  return (
    <section className="space-y-2.5">
      <ShareButtons url={url} title={title} text={`${title} — who still has to pay`} />
      <Link href="/" className="btn-ghost w-full">
        Make your own split
      </Link>
    </section>
  );
}
