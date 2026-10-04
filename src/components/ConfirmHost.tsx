"use client";

import { useEffect, useRef, useState } from "react";
import { onConfirmRequest, type ConfirmRequest } from "@/lib/client/confirm";
import { cx } from "./ui";

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void };

/** Compact centred glass dialog for confirmations; scales in from 88%. */
export function ConfirmHost() {
  const [req, setReq] = useState<Pending | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => onConfirmRequest(setReq), []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (req && !d.open) d.showModal();
    if (!req && d.open) d.close();
  }, [req]);

  const answer = (ok: boolean) => {
    req?.resolve(ok);
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
            <button type="button" className="btn-secondary h-12" onClick={() => answer(false)}>
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              className={cx("btn h-12 glass-flat font-semibold", req.destructive ? "text-ink" : "text-accent")}
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
