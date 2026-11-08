"use client";

import { RotateCcw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { remove } from "@/lib/client/storage";

/**
 * Shown when a page fails: storage was unreachable, or something saved on this
 * phone (like the split in progress) can't be read any more. The nav stays, so
 * History and the rest are a tap away.
 */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    console.error(error);
  }, [error]);

  function startOver() {
    remove("bs:draft");
    if (pathname === "/") retry();
    else router.push("/");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-4 pb-6 md:pb-16">
      <div className="card p-8 text-center" role="alert">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
          <RotateCcw size={28} strokeWidth={2} aria-hidden />
        </div>
        <h1 className="text-[24px] font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-ink-2">Try again in a moment. If it keeps happening on a new split, start it over.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn-primary h-12 px-6" onClick={() => retry()}>
            Try again
          </button>
          <button type="button" className="btn-secondary h-12 px-6" onClick={startOver}>
            Discard the split in progress
          </button>
        </div>
      </div>
    </main>
  );
}
