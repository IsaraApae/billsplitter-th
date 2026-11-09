"use client";

import { useBrowserValue } from "@/lib/client/hooks";
import { ShareButtons } from "./ShareButtons";

/** Share / Copy link for "Who pays fastest" (its link preview shows the podium). */
export function FastestShare({ id, organiser }: { id: string; organiser: string }) {
  const url = `${useBrowserValue(() => window.location.origin, "")}/o/${id}/fastest`;
  const title = `Who pays ${organiser} fastest`;
  return <ShareButtons url={url} title={title} text={`${title}: the top five, and how fast everyone pays`} />;
}
