import "server-only";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { COLOR_HEX } from "../colors";
import { LogoMark } from "../icon";
import { formatMoney } from "../money";
import type { PersonColor } from "../types";

export const shareImageSize = { width: 1200, height: 630 };

const font = (f: string) => readFile(join(process.cwd(), "assets/fonts", f));

// The app's palette (light mode).
const INK = "#1C1C1E";
const INK_2 = "#636366";
const ACCENT = "#047857";

interface Card {
  /** small line above the title, e.g. "Tue, 6 Oct 2026" or "Big bill · 3 bills" */
  kicker: string;
  title: string;
  total: number;
  currency: string;
  people: { name: string; color?: PersonColor }[];
  /** e.g. "3 people · split by item" */
  detail: string;
  /** the receipt's heading (default "TOTAL") */
  label?: string;
  /** the button (default "See what you owe →") */
  cta?: string;
  /** the line at the bottom left (default "Tap to see what you owe and mark it paid") */
  tagline?: string;
}

/**
 * The link preview (LINE, Messenger…): a white page with the site's soft
 * green glows, the bill's date and title on the left, and the total on a
 * paper receipt with the people and a "See what you owe" button.
 */
export async function shareImage(card: Card | null) {
  const [latin700, thai700, latin400] = await Promise.all([
    font("NotoSansThai-latin-700.woff"),
    font("NotoSansThai-thai-700.woff"),
    font("NotoSansThai-latin-400.woff"),
  ]);
  const money = card ? formatMoney(card.total, card.currency) : "";
  // "฿1,800.00" → big whole part, smaller decimals (like the app). The font
  // subset has no ฿, so the baht sign is drawn (BahtSign) instead.
  const baht = money.startsWith("฿");
  const m = /^(.*?)([.,]\d+)?$/.exec(baht ? money.slice(1) : money);
  const whole = m?.[1] ?? money;
  const cents = m?.[2] ?? "";
  const title = card ? (card.title.length > 48 ? `${card.title.slice(0, 46)}…` : card.title) : "Bill Splitter";

  const bump = 24;
  const paper = 456;
  const dashes = (
    <div style={{ display: "flex", gap: 10, margin: "20px 0" }}>
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} style={{ width: 14, height: 4, borderRadius: 2, background: "#D1D1D6" }} />
      ))}
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          gap: 48,
          padding: "0 64px",
          background:
            "radial-gradient(circle at 6% 6%, rgba(52,211,153,0.30), rgba(52,211,153,0) 40%), radial-gradient(circle at 96% 18%, rgba(20,184,166,0.20), rgba(20,184,166,0) 38%), radial-gradient(circle at 88% 104%, rgba(94,234,212,0.30), rgba(94,234,212,0) 44%), #ffffff",
          fontFamily: "Noto",
          color: INK,
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 32, fontWeight: 700, marginLeft: -14 }}>
            <LogoMark px={84} />
            Bill Splitter
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 30, color: INK_2 }}>{card?.kicker ?? "Split the bill with friends"}</div>
            <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.15, letterSpacing: -1, marginTop: 8 }}>{title}</div>
          </div>
          <div style={{ fontSize: 28, color: INK_2 }}>
            {card ? (card.tagline ?? "Tap to see what you owe and mark it paid") : "Scan the receipt, share one link"}
          </div>
        </div>

        <div style={{ width: paper, display: "flex", flexDirection: "column", margin: "44px 0 40px" }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "40px 36px 28px",
              borderRadius: "22px 22px 0 0",
              background: "#ffffff",
              boxShadow: "0 24px 60px -18px rgba(4,120,87,0.35), 0 2px 10px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 6, color: INK_2 }}>{card?.label ?? "TOTAL"}</div>
              {dashes}
              {card ? (
                <div style={{ display: "flex", alignItems: "baseline", letterSpacing: -2, color: ACCENT }}>
                  {baht && <BahtSign size={84} color={ACCENT} />}
                  <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1 }}>{whole}</div>
                  <div style={{ fontSize: 42, fontWeight: 700, color: "#34A37F" }}>{cents}</div>
                </div>
              ) : (
                <div style={{ fontSize: 40, fontWeight: 700, color: ACCENT }}>Split it fairly</div>
              )}
              {dashes}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <Avatars people={card?.people ?? []} />
                {card && <div style={{ fontSize: 26, color: INK_2 }}>{card.detail}</div>}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                alignSelf: "stretch",
                height: 64,
                borderRadius: 32,
                background: ACCENT,
                color: "#ffffff",
                fontSize: 27,
                fontWeight: 700,
              }}
            >
              {card ? (card.cta ?? "See what you owe →") : "Split a bill →"}
            </div>
          </div>
          {/* Scalloped bottom edge of the receipt. */}
          <div style={{ display: "flex", marginTop: -bump / 2, height: bump }}>
            {Array.from({ length: paper / bump }, (_, i) => (
              <div key={i} style={{ width: bump, height: bump, borderRadius: bump, background: "#ffffff" }} />
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...shareImageSize,
      fonts: [
        { name: "Noto", data: latin700, weight: 700, style: "normal" },
        { name: "Noto", data: thai700, weight: 700, style: "normal" },
        { name: "Noto", data: latin400, weight: 400, style: "normal" },
      ],
    },
  );
}

/** Up to 6 overlapping initials, then "+N". */
function Avatars({ people }: { people: { name: string; color?: PersonColor }[] }) {
  if (people.length === 0) return null;
  const shown = people.slice(0, 6);
  const more = people.length - shown.length;
  const avatar = {
    width: 64,
    height: 64,
    borderRadius: 32,
    border: "4px solid #ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
  } as const;
  return (
    <div style={{ display: "flex" }}>
      {shown.map((p, i) => (
        <div key={i} style={{ ...avatar, marginLeft: i === 0 ? 0 : -14, background: COLOR_HEX[p.color ?? "slate"], color: INK, fontSize: 28 }}>
          {[...(p.name.trim() || "?")][0].toUpperCase()}
        </div>
      ))}
      {more > 0 && <div style={{ ...avatar, marginLeft: -14, background: "#E5E5EA", color: INK_2, fontSize: 24 }}>{`+${more}`}</div>}
    </div>
  );
}

/** ฿ drawn as a "B" with a vertical stroke through it (the bundled font has no ฿). */
function BahtSign({ size, color }: { size: number; color: string }) {
  return (
    <div style={{ display: "flex", position: "relative", fontSize: size, fontWeight: 700, lineHeight: 1, marginRight: size * 0.07 }}>
      B
      <div
        style={{
          position: "absolute",
          left: size * 0.255,
          top: -size * 0.06,
          width: size * 0.085,
          height: size * 1.04,
          borderRadius: size * 0.02,
          background: color,
        }}
      />
    </div>
  );
}
