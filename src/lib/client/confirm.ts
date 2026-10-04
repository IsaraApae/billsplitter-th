"use client";

/**
 * Promise-based confirmation, rendered by <ConfirmHost/> as a compact glass
 * dialog with two capsule buttons (replaces the browser's confirm()).
 */
export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** destructive action: the confirm button is neutral ink, not the accent (red is kept for errors) */
  destructive?: boolean;
}

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void };

let listener: ((p: Pending | null) => void) | null = null;

export function onConfirmRequest(fn: (p: Pending | null) => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function askConfirm(req: ConfirmRequest): Promise<boolean> {
  // Fallback if the host isn't mounted (shouldn't happen in the app).
  if (!listener) return Promise.resolve(window.confirm(req.message ? `${req.title}\n\n${req.message}` : req.title));
  return new Promise((resolve) => listener?.({ ...req, resolve }));
}
