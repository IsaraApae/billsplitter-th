"use client";

import { Camera, ImageIcon, RefreshCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { askConfirm } from "@/lib/client/confirm";
import { compressImage } from "@/lib/client/image";
import { getProfile, qrImageUrl, saveProfile, type Profile } from "@/lib/client/profile";
import { formatPromptPayId, isValidPromptPayId, normalizePromptPayInput } from "@/lib/promptpay";
import { PERSON_COLORS, type QrMode } from "@/lib/types";
import { BackupSection } from "./BackupSection";
import { PayQr } from "./PayQr";
import { ThemePicker } from "./ThemeToggle";
import { Avatar, COLOR_HEX, Callout, ICON, Section, Segmented, cx } from "./ui";

export const EMOJIS = ["😀", "😎", "🤓", "🥳", "🐱", "🐶", "🐼", "🦊", "🍜", "🍣", "🍕", "☕", "🍺", "🌶️", "⚽", "🎮"];

export function MeSettings() {
  const [p, setP] = useState<Profile>(getProfile);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<Profile>) =>
    setP((cur) => {
      const next = { ...cur, ...patch };
      saveProfile(next);
      return next;
    });

  const ownerHeaders = (): Record<string, string> =>
    p.ownerId && p.ownerToken ? { "x-owner-id": p.ownerId, "x-owner-token": p.ownerToken } : {};

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const blob = await compressImage(file, 1024, 0.9);
      const fd = new FormData();
      fd.append("image", blob, "qr.jpg");
      const res = await fetch("/api/qr", { method: "POST", body: fd, headers: ownerHeaders() });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? `Upload failed (${res.status}).`);
      update({
        qrMode: "upload",
        ownerId: data.ownerId,
        ownerToken: data.token ?? p.ownerToken,
        qrVersion: data.version,
      });
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : "You're offline — try again when connected.");
    } finally {
      setUploading(false);
    }
  }

  async function removeQr() {
    const ok = await askConfirm({
      title: "Remove your QR?",
      message: "It disappears from all your shared splits.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch("/api/qr", { method: "DELETE", headers: ownerHeaders() });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? "Couldn't remove it.");
      }
      // Keep ownerId/token so a later upload reuses the same record (old links pick it up).
      update({ qrMode: "none", qrVersion: undefined });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const hasUpload = p.qrMode === "upload" && !!p.ownerId && p.qrVersion !== undefined;
  const ppValid = isValidPromptPayId(p.promptpay);

  return (
    <div className="space-y-6">
      <h1 className="large-title">Me</h1>

      <Section title="Your name">
        <div className="card space-y-4 p-5">
          <div className="flex items-center gap-3">
            <Avatar person={{ name: p.name || "Me", emoji: p.emoji, color: p.color ?? "emerald" }} size={52} />
            <input
              className="input font-semibold"
              placeholder="Me"
              aria-label="Your name"
              maxLength={40}
              value={p.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </div>
          <EmojiColorPicker
            emoji={p.emoji}
            color={p.color ?? "emerald"}
            onEmoji={(emoji) => update({ emoji })}
            onColor={(color) => update({ color })}
          />
          <p className="text-[13px] text-ink-2">You&apos;re added to every new split with this name.</p>
        </div>
      </Section>

      <Section title="PromptPay QR">
        <div className="card space-y-4 p-5">
          <Segmented<QrMode>
            label="QR type"
            flat
            value={p.qrMode}
            onChange={(qrMode) => update({ qrMode })}
            options={[
              { value: "upload", label: "My QR" },
              { value: "generate", label: "Number" },
              { value: "none", label: "None" },
            ]}
          />

          {p.qrMode === "upload" && (
            <div className="space-y-3">
              {hasUpload ? (
                <div className="flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrImageUrl(p.ownerId!, p.qrVersion)}
                    alt="Your PromptPay QR"
                    className="size-32 rounded-2xl bg-white object-contain p-2 shadow-[var(--card-shadow)]"
                  />
                  <div className="flex flex-1 flex-col gap-2">
                    <button type="button" className="btn-secondary h-11" disabled={uploading} onClick={() => galleryRef.current?.click()}>
                      <RefreshCw size={20} {...ICON} aria-hidden /> Replace
                    </button>
                    <button type="button" className="btn-secondary h-11" disabled={uploading} onClick={removeQr}>
                      <Trash2 size={20} {...ICON} aria-hidden /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn-primary h-13" disabled={uploading} onClick={() => cameraRef.current?.click()}>
                    <Camera size={22} {...ICON} aria-hidden /> Camera
                  </button>
                  <button type="button" className="btn-secondary h-13" disabled={uploading} onClick={() => galleryRef.current?.click()}>
                    <ImageIcon size={22} {...ICON} aria-hidden /> Gallery
                  </button>
                </div>
              )}
              {uploading && <p className="text-[15px] text-ink-2" aria-live="polite">Uploading…</p>}
              <p className="text-[13px] text-ink-2">
                Save the QR from your banking app (e.g. “My QR”) and upload it once. Every split shows your current QR —
                replacing it updates old links too. Payers type the amount themselves.
              </p>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {p.qrMode === "generate" && (
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="label">PromptPay number or ID</span>
                <input
                  className="input tnum"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="08x-xxx-xxxx or 13-digit ID"
                  value={p.promptpay}
                  aria-invalid={p.promptpay !== "" && !ppValid}
                  onChange={(e) => update({ promptpay: normalizePromptPayInput(e.target.value) })}
                />
              </label>
              {p.promptpay && !ppValid ? (
                <p className="px-1 text-[13px] font-medium text-danger">
                  Use the mobile number, 13-digit ID or 15-digit e-wallet ID registered with PromptPay. Bank account
                  numbers can&apos;t be used here — choose <b>My QR</b> and upload the QR from your banking app, or put
                  the account number in the note below.
                </p>
              ) : ppValid ? (
                <>
                  <p className="px-1 text-[13px] text-ink-2">
                    Preview for {formatPromptPayId(p.promptpay)} — on shared splits each person&apos;s QR includes
                    their exact amount.
                  </p>
                  <PayQr source={{ mode: "generate", promptpay: p.promptpay }} amount={10000} name="Example · ฿100" />
                </>
              ) : null}
            </div>
          )}

          <label className="block space-y-1.5">
            <span className="label">Bank details / note (optional)</span>
            <textarea
              className="input min-h-20 rounded-[20px] py-3"
              maxLength={300}
              placeholder="e.g. KBank 123-4-56789-0"
              value={p.note}
              onChange={(e) => update({ note: e.target.value })}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Name on your bank account (for checking slips)</span>
            <input
              className="input"
              maxLength={80}
              autoComplete="off"
              placeholder="e.g. ISARA A. / อิสรา อ."
              value={p.slipName ?? ""}
              onChange={(e) => update({ slipName: e.target.value })}
            />
            <span className="block px-1 text-[13px] text-ink-2">
              When friends upload a transfer slip, it must show this name as the receiver before they&apos;re ticked.
              Add both the English and Thai spelling, separated by “/”.
            </span>
          </label>
          {error && <Callout tone="error">{error}</Callout>}
        </div>
      </Section>

      <Section title="Appearance">
        <ThemePicker />
      </Section>

      <BackupSection />

      <p className="px-5 text-[13px] text-ink-2">Everything on this page is saved on this device only.</p>
    </div>
  );
}

export function EmojiColorPicker({
  emoji,
  color,
  onEmoji,
  onColor,
}: {
  emoji?: string;
  color: string;
  onEmoji: (e: string | undefined) => void;
  onColor: (c: (typeof PERSON_COLORS)[number]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Emoji">
        <button
          type="button"
          role="radio"
          aria-checked={!emoji}
          onClick={() => onEmoji(undefined)}
          className={cx(!emoji ? "chip-accent" : "chip", "size-11 shrink-0 justify-center px-0 text-[13px] font-semibold")}
        >
          Aa
        </button>
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={emoji === e}
            aria-label={`Emoji ${e}`}
            onClick={() => onEmoji(e)}
            className={cx(emoji === e ? "chip-accent" : "chip", "size-11 shrink-0 justify-center px-0 text-[22px]")}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
        {PERSON_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={c}
            onClick={() => onColor(c)}
            className="grid size-11 place-items-center rounded-full"
          >
            <span
              className={cx("size-8 rounded-full", color === c && "outline-2 outline-offset-2 outline-ink")}
              style={{ background: COLOR_HEX[c] }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
