"use client";

/**
 * Copies text that isn't known yet, e.g. a bill's link that exists once it's saved.
 * Call it straight from the tap: Safari only lets a page copy during one, so the text
 * goes in as a promise that the clipboard waits for. Other browsers copy once it's
 * ready. Resolves to whether it was copied.
 */
export async function copyWhenReady(text: Promise<string>): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) })]);
      return true;
    }
  } catch {
    /* no promised copies here: try plain text below */
  }
  try {
    await navigator.clipboard.writeText(await text);
    return true;
  } catch {
    return false;
  }
}

const COPIED = "bs:linkCopied";

/** The bill whose link was just copied on saving, so its page can say so. */
export function markLinkCopied(id: string): void {
  try {
    sessionStorage.setItem(COPIED, `${id}|${Date.now()}`);
  } catch {
    /* private mode: the page just won't mention it */
  }
}

/** Whether this bill's link was copied in the last half minute (the page opens right after). */
export function linkJustCopied(id: string): boolean {
  try {
    const [copiedId, at] = (sessionStorage.getItem(COPIED) ?? "").split("|");
    return copiedId === id && Date.now() - Number(at) < 30_000;
  } catch {
    return false;
  }
}
