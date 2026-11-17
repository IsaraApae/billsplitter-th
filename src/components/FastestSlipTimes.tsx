"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getDeviceKey, load } from "@/lib/client/storage";

/**
 * On the organiser's own Who pays fastest, when some slips were kept before their transfer time
 * was read: has the server read those times (once each), then shows the ranking again if any
 * changed. Nothing to see; it runs in the background.
 */
export function FastestSlipTimes({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => {
    if (load<string | null>("bs:board", null) !== id) return;
    let cancelled = false;
    void (async () => {
      let found = false;
      // Each call reads for up to ~50 s and says how many are left; a long history takes a few.
      for (let i = 0; i < 3 && !cancelled; i++) {
        const r = await fetch(`/api/boards/${id}/slip-times`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner: getDeviceKey() }),
        });
        if (!r.ok) break;
        const d = (await r.json()) as { read: number; left: number };
        if (d.read > 0) found = true;
        if (d.left === 0) break;
      }
      if (found && !cancelled) router.refresh();
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, router]);
  return null;
}
