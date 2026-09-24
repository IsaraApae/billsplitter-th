"use client";

import { Camera, ImageIcon, RefreshCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { compressImage } from "@/lib/client/image";
import { getProfile, qrImageUrl, saveProfile, type Profile } from "@/lib/client/profile";
import { formatPromptPayId, isValidPromptPayId } from "@/lib/promptpay";
import { PERSON_COLORS, type QrMode } from "@/lib/types";
import { PayQr } from "./PayQr";
import { ThemePicker } from "./ThemeToggle";
import { Avatar, COLOR_HEX, Callout, Section, Segmented, cx } from "./ui";

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
    if (!confirm("Remove your QR? It disappears from all your shared splits.")) return;
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
    <div className="space-y-7">
      <h1 className="large-title">Me</h1>

      <Section title="Your name">
        <div className="card space-y-4 p-4">
          <div className="flex items-center gap-3">
            <Avatar person={{ name: p.name || "Me", emoji: p.emoji, color: p.color ?? "emerald" }} size={52} />
            <input
              className="input text-[17px] font-semibold"
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
        <div className="card space-y-4 p-4">
          <Segmented<QrMode>
            label="QR type"
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
                    className="size-32 rounded-2xl bg-white object-contain p-2 shadow-[inset_0_0_0_1px_var(--line)]"
                  />
                  <div className="flex flex-1 flex-col gap-2">
                    <button type="button" className="btn-secondary h-11" disabled={uploading} onClick={() => galleryRef.current?.click()}>
                      <RefreshCw size={16} aria-hidden /> Replace
                    </button>
                    <button type="button" className="btn-ghost h-11 text-danger" disabled={uploading} onClick={removeQr}>
                      <Trash2 size={16} aria-hidden /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn-primary h-13" disabled={uploading} onClick={() => cameraRef.current?.click()}>
                    <Camera size={18} aria-hidden /> Camera
                  </button>
                  <button type="button" className="btn-secondary h-13" disabled={uploading} onClick={() => galleryRef.current?.click()}>
                    <ImageIcon size={18} aria-hidden /> Gallery
                  </button>
                </div>
              )}
              {uploading && <p className="text-[14px] text-ink-2" aria-live="polite">Uploading…</p>}
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
                <span className="label px-1">PromptPay number or ID</span>
                <input
                  className="input tnum"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="08x-xxx-xxxx or 13-digit ID"
                  value={p.promptpay}
                  aria-invalid={p.promptpay !== "" && !ppValid}
                  onChange={(e) => update({ promptpay: e.target.value.replace(/\D/g, "").slice(0, 15) })}
                />
              </label>
              {p.promptpay && !ppValid ? (
                <p className="px-1 text-[13px] font-medium text-danger">
                  Use a 10-digit mobile number, 13-digit ID or 15-digit e-wallet ID.
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
            <span className="label px-1">Bank details / note (optional)</span>
            <textarea
              className="input min-h-20 py-3"
              maxLength={300}
              placeholder="e.g. KBank 123-4-56789-0"
              value={p.note}
              onChange={(e) => update({ note: e.target.value })}
            />
          </label>
          {error && <Callout tone="error">{error}</Callout>}
        </div>
      </Section>

      <Section title="Appearance">
        <ThemePicker />
      </Section>

      <p className="px-1 text-[13px] text-ink-2">Everything on this page is saved on this device only.</p>
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
          className={cx("chip size-11 shrink-0 justify-center px-0 text-[13px] font-bold", !emoji ? "bg-accent-soft text-accent-strong" : "text-ink-2")}
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
            className={cx("chip size-11 shrink-0 justify-center px-0 text-[22px]", emoji === e && "bg-accent-soft shadow-[inset_0_0_0_2px_var(--accent)]")}
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
              className={cx("size-8 rounded-full transition-transform duration-300 ease-spring", color === c && "scale-110 ring-4 ring-[var(--field-border)]")}
              style={{ background: COLOR_HEX[c] }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
