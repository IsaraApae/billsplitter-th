// A short tag that changes whenever what a link preview shows changes (title,
// date, total, people). Added to shared links as ?v=…: chat apps like LINE
// cache a link's preview by URL, so an edited bill needs a new URL for the
// preview to update. Pure.

import { calculate } from "./calc";
import type { SplitDoc } from "./types";

/** djb2 → base36: short and stable, not for security. */
export function shortHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function splitVersion(doc: SplitDoc): string {
  return shortHash(
    JSON.stringify([doc.title, doc.date ?? doc.createdAt.slice(0, 10), calculate(doc).total, doc.people.map((p) => p.name)]),
  );
}

export function eventVersion(meta: { title: string; date: string }, docs: SplitDoc[]): string {
  return shortHash(JSON.stringify([meta.title, meta.date, docs.map(splitVersion)]));
}
