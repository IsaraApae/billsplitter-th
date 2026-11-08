"use client";

import { useEffect, useRef, useState } from "react";
import { onConfirmRequest, type ConfirmRequest } from "@/lib/client/confirm";
import { cx } from "./ui";

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void };

/** Compact centred raised dialog for confirmations; scales in from 88%. */
export function ConfirmHost() {
  const [req, setReq] = useState<Pending | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const current = useRef<Pending | null>(null);

  // A new question while one is open answers the old one "no", so its caller isn't left waiting.
  useEffect(
    () =>
      onConfirmRequest((next) => {
        current.current?.resolve(false);
        current.current = next;
        setReq(next);
      }),
    [],
  );

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (req && !d.open) d.showModal();
    if (!req && d.open) d.close();
    // Enter answers the focused button: for Delete or Discard that's Cancel, so it can't happen by accident.
    if (req) (req.destructive ? cancelRef : okRef).current?.focus();
  }, [req]);

  const answer = (ok: boolean) => {
    req?.resolve(ok);
    current.current = null;
    setReq(null);
  };

  return (
    <dialog
      ref={ref}
      className="alert panel"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        answer(false);
      }}
    >
      {req && (
        <div className="p-6 pt-7 text-center">
          <h2 id="confirm-title" className="text-[17px] font-semibold">
            {req.title}
          </h2>
          {req.message && <p className="mt-1.5 text-[15px] leading-snug text-ink-2">{req.message}</p>}
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <button ref={cancelRef} type="button" className="btn-secondary h-12" onClick={() => answer(false)}>
              Cancel
            </button>
            <button
              ref={okRef}
              type="button"
              className={cx("btn h-12 raised-flat font-semibold", req.destructive ? "text-ink" : "text-accent")}
              onClick={() => answer(true)}
            >
              {req.confirmLabel ?? "OK"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
