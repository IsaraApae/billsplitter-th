"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { claimMySplits } from "@/lib/client/claim";
import { getDeviceKey, load, save } from "@/lib/client/storage";
import { Callout } from "./ui";

const BOARD = "bs:board";

/**
 * "Who pays fastest" is worked out on the server from this phone's bills, the same way for
 * the shared list, so both always agree: find (or make) this phone's list and open its page.
 */
export function FastestRedirect() {
  const router = useRouter();
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Bills the server doesn't know are this phone's yet are counted too.
        await claimMySplits(true);
        let id = load<string | null>(BOARD, null);
        if (!id) {
          const r = await fetch("/api/boards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ owner: getDeviceKey() }),
          });
          if (!r.ok) throw new Error();
          id = ((await r.json()) as { id: string }).id;
          save(BOARD, id);
        }
        if (!cancelled) router.replace(`/o/${id}/fastest`);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);
  return error ? (
    <Callout tone="error">Couldn&apos;t load who pays fastest. Check your connection and try again.</Callout>
  ) : (
    <p className="px-1 text-ink-2">Loading…</p>
  );
}
