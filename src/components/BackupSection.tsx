"use client";

import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { BACKUP_KEYS, backupSummary, makeBackup, mergeBackup, parseBackup, type BackupData } from "@/lib/backup";
import { askConfirm } from "@/lib/client/confirm";
import { load, save } from "@/lib/client/storage";
import { toDay } from "@/lib/draft";
import { Callout, ICON, Section } from "./ui";

function readAll(): BackupData {
  const data: BackupData = {};
  for (const k of BACKUP_KEYS) {
    const v = load<unknown>(k, undefined);
    if (v !== undefined) data[k] = v;
  }
  return data;
}

/** Me page: save everything this phone keeps to a file, or restore it on another phone. */
export function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function saveBackup() {
    setMsg(null);
    const blob = new Blob([JSON.stringify(makeBackup(readAll()))], { type: "application/json" });
    const file = new File([blob], `bill-splitter-backup-${toDay(new Date())}.json`, { type: "application/json" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        // Phones: the share sheet's "Save to Files" (or send it to yourself).
        await navigator.share({ files: [file], title: "Bill Splitter backup" });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        setMsg({ tone: "success", text: "Backup saved to your downloads." });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg({ tone: "error", text: "Couldn't save the backup." });
    }
  }

  async function restore(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    const backup = parseBackup(await file.text());
    if (!backup) {
      setMsg({ tone: "error", text: "That file isn't a Bill Splitter backup." });
      return;
    }
    const { splits, friends } = backupSummary(backup);
    const from = backup.exportedAt
      ? new Date(backup.exportedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "";
    const ok = await askConfirm({
      title: "Restore this backup?",
      message: `${splits} ${splits === 1 ? "split" : "splits"} and ${friends} ${friends === 1 ? "friend" : "friends"}${
        from ? ` from ${from}` : ""
      }. They're added to what's on this phone; nothing here is removed.`,
      confirmLabel: "Restore",
    });
    if (!ok) return;
    const merged = mergeBackup(readAll(), backup.data);
    for (const k of BACKUP_KEYS) if (merged[k] !== undefined) save(k, merged[k]);
    // Every page reads these on load.
    window.location.reload();
  }

  return (
    <Section title="Backup">
      <div className="card space-y-3.5 p-5">
        <p className="text-[15px] text-ink-2">
          Your splits, friends and the right to edit your splits are kept on this phone only. Save a backup to move
          them to a new phone.
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" className="btn-secondary h-12 px-3 whitespace-nowrap" onClick={saveBackup}>
            <Download size={20} {...ICON} aria-hidden /> Save backup
          </button>
          <button type="button" className="btn-secondary h-12 px-3 whitespace-nowrap" onClick={() => fileRef.current?.click()}>
            <Upload size={20} {...ICON} aria-hidden /> Restore
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            void restore(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
        <p className="text-[13px] text-ink-2">The file lets whoever has it edit your splits, so keep it private.</p>
      </div>
    </Section>
  );
}
