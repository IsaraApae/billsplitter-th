"use client";

import { Link2, Unlink } from "lucide-react";
import { useEffect, useState } from "react";
import { copyWhenReady } from "@/lib/client/clipboard";
import { askConfirm } from "@/lib/client/confirm";
import { getDeviceKey } from "@/lib/client/storage";
import { Callout, ICON, Section } from "./ui";

/**
 * Me page: a private link for ป้าคีน, a LINE bot that records spending from bank alerts. With it, ป้าคีน matches an
 * alert to the bill made here for it and takes the bill's name and this phone's own share, instead of asking.
 * The link is only shown once, as it is copied; making a new one stops the old one.
 */
export function PaakeenLink() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const call = async (extra: object) => {
    const r = await fetch("/api/organiser/paakeen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: getDeviceKey(), ...extra }),
    });
    if (!r.ok) throw new Error("failed");
    return (await r.json()) as { connected: boolean; link?: string };
  };

  useEffect(() => {
    call({}).then(
      (r) => setConnected(r.connected),
      () => setConnected(false),
    );
  }, []);

  async function copyNew() {
    setMsg(null);
    // Straight from the tap (no confirm first), so Safari lets the page copy the link once it arrives.
    const made = call({ make: true });
    const copied = await copyWhenReady(made.then((r) => r.link ?? ""));
    try {
      const r = await made;
      setConnected(r.connected);
      setMsg(copied
        ? { tone: "success", text: "Link copied. In ป้าคีน, open ตั้งค่า → Bill Splitter and paste it." }
        : { tone: "error", text: `Couldn't copy it. Here it is: ${r.link}` });
    } catch {
      setMsg({ tone: "error", text: "Couldn't make a link. Check your connection and try again." });
    }
  }

  async function disconnect() {
    setMsg(null);
    if (!(await askConfirm({ title: "Disconnect ป้าคีน?", message: "Its link stops working straight away.", confirmLabel: "Disconnect", destructive: true }))) return;
    try {
      setConnected((await call({ drop: true })).connected);
    } catch {
      setMsg({ tone: "error", text: "Couldn't disconnect. Try again." });
    }
  }

  return (
    <Section title="ป้าคีน (LINE)">
      <div className="card space-y-3.5 p-5">
        <p className="text-[15px] text-ink-2">
          ป้าคีน records your spending from your bank&apos;s LINE alerts. Give it this private link and, when a payment
          matches a bill you made here, it uses the bill&apos;s name and your own share instead of asking you.
        </p>
        <p className="text-[13px] text-ink-2">
          It can only read bills from the last few hours: their name, what you paid, your share and the item names. Never
          who your friends are.
        </p>
        <div className={connected ? "grid grid-cols-2 gap-2.5" : ""}>
          <button type="button" className="btn-secondary h-12 w-full px-3 whitespace-nowrap" disabled={connected === null} onClick={copyNew}>
            <Link2 size={20} {...ICON} className="shrink-0" aria-hidden />
            {connected ? "New link" : "Copy link for ป้าคีน"}
          </button>
          {connected && (
            <button type="button" className="btn-secondary h-12 px-3 whitespace-nowrap text-danger" onClick={disconnect}>
              <Unlink size={20} {...ICON} className="shrink-0" aria-hidden />
              Disconnect
            </button>
          )}
        </div>
        {connected && !msg && <p className="text-[13px] text-ink-2">Connected. A new link stops the old one.</p>}
        {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
      </div>
    </Section>
  );
}
