import "server-only";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { COLOR_HEX } from "../colors";
import { formatMoney } from "../money";
import type { PersonColor } from "../types";

export const shareImageSize = { width: 1200, height: 630 };

const font = (f: string) => readFile(join(process.cwd(), "assets/fonts", f));

// The app's palette (light mode).
const INK = "#1C1C1E";
const INK_2 = "#636366";
const ACCENT = "#047857";
const BG = "#F5F3F7";

interface Card {
  /** small line above the title, e.g. "Tue, 6 Oct 2026" or "Big bill · 3 bills" */
  kicker: string;
  title: string;
  total: number;
  currency: string;
  people: { name: string; color?: PersonColor }[];
  /** e.g. "3 people · split by item" */
  detail: string;
}

/**
 * The link preview (LINE, Messenger…): the app's look — light page with soft
 * green glows, one white rounded card, big total, the people as avatars.
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
  const shown = card?.people.slice(0, 6) ?? [];
  const more = (card?.people.length ?? 0) - shown.length;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 48,
          backgroundColor: BG,
          backgroundImage:
            "radial-gradient(circle at 8% 6%, rgba(52,211,153,0.38), rgba(52,211,153,0) 42%), radial-gradient(circle at 96% 20%, rgba(20,184,166,0.30), rgba(20,184,166,0) 40%), radial-gradient(circle at 85% 100%, rgba(94,234,212,0.34), rgba(94,234,212,0) 45%), radial-gradient(circle at 5% 95%, rgba(163,230,53,0.22), rgba(163,230,53,0) 40%)",
          fontFamily: "Noto",
          color: INK,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px 56px",
            borderRadius: 44,
            background: "rgba(255,255,255,0.86)",
            boxShadow: "0 24px 60px -20px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 30, color: INK_2, fontWeight: 400 }}>{card?.kicker ?? "Split the bill, share one link"}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 700 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: ACCENT,
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 34,
                }}
              >
                ÷
              </div>
              Bill Splitter
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.15, letterSpacing: -1 }}>{title}</div>
            {card && (
              <div style={{ display: "flex", alignItems: "baseline", marginTop: 14, letterSpacing: -2 }}>
                {baht && <BahtSign size={112} />}
                <div style={{ fontSize: 112, fontWeight: 700, lineHeight: 1 }}>{whole}</div>
                <div style={{ fontSize: 56, fontWeight: 700, color: INK_2 }}>{cents}</div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              {shown.length > 0 && (
                <div style={{ display: "flex" }}>
                  {shown.map((p, i) => (
                    <div
                      key={i}
                      style={{
                        width: 64,
                        height: 64,
                        marginLeft: i === 0 ? 0 : -14,
                        borderRadius: 32,
                        border: "4px solid white",
                        background: COLOR_HEX[p.color ?? "slate"],
                        color: INK,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 28,
                        fontWeight: 700,
                      }}
                    >
                      {[...(p.name.trim() || "?")][0].toUpperCase()}
                    </div>
                  ))}
                  {more > 0 && (
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        marginLeft: -14,
                        borderRadius: 32,
                        border: "4px solid white",
                        background: "#E5E5EA",
                        color: INK_2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 24,
                        fontWeight: 700,
                      }}
                    >
                      {`+${more}`}
                    </div>
                  )}
                </div>
              )}
              {card && <div style={{ fontSize: 30, color: INK_2, fontWeight: 400 }}>{card.detail}</div>}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                height: 64,
                padding: "0 30px",
                borderRadius: 32,
                background: ACCENT,
                color: "white",
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              See what you owe →
            </div>
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

/** ฿ drawn as a "B" with a vertical stroke through it (the bundled font has no ฿). */
function BahtSign({ size }: { size: number }) {
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
          background: INK,
        }}
      />
    </div>
  );
}
