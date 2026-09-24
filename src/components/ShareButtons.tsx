"use client";

import { Check, Copy, Share } from "lucide-react";
import { useState } from "react";
import { useBrowserValue } from "@/lib/client/hooks";

export function ShareButtons({ url, title, text }: { url: string; title: string; text: string }) {
  const canShare = useBrowserValue(() => typeof navigator.share === "function", false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function share() {
    setMsg(null);
    try {
      await navigator.share({ title, text, url });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg("Sharing failed — copy the link instead.");
    }
  }

  async function copy() {
    setMsg(null);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for older/insecure contexts (e.g. http:// on a LAN IP)
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (!ok) {
        setMsg("Couldn't copy automatically — long-press the link to copy it.");
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {canShare && (
          <button type="button" className="btn-primary h-13 text-[16px]" onClick={share}>
            <Share size={18} aria-hidden /> Share
          </button>
        )}
        <button
          type="button"
          className={canShare ? "btn-secondary h-13 text-[16px]" : "btn-primary col-span-2 h-13 text-[16px]"}
          onClick={copy}
        >
          {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      {msg && <p className="px-1 text-[13px] text-danger">{msg}</p>}
    </div>
  );
}
