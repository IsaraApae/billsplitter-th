import "server-only";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { COLOR_HEX, PLACE_COLORS, PODIUM_ORDER } from "../colors";
import { nameInitial } from "../friends";
import { LogoMark } from "../icon";
import { formatMoney } from "../money";
import type { PersonColor } from "../types";

export const shareImageSize = { width: 1200, height: 630 };

const font = (f: string) => readFile(join(process.cwd(), "assets/fonts", f));

// Poster type, then its accented letters (é, ü, ğ…). Satori only uses one font per name, so each cut has its
// own name here; otherwise a missing É would come from the plain body font. Thai: Kanit ExtraBold, as in the app.
const DISPLAY = "Display, DisplayLatin1, DisplayLatinExt, DisplayThai";
// Body text: Noto Sans Thai's Latin, Noto Sans for letters it lacks (ş, ğ, ő, ł…), then its Thai.
const BODY = "Noto, NotoExt, NotoThai";

// The app's palette (light mode).
const INK = "#1C1C1E";
const INK_2 = "#636366";
const ACCENT = "#00875A"; // on the white receipt
const GREEN = "#00B368";
const ON_GREEN = "#04261A";

interface Card {
  /** small line above the title, e.g. "Tue, 6 Oct 2026" or "Big bill · 3 bills" */
  kicker: string;
  title: string;
  total: number;
  currency: string;
  /** `organiser`: the person sharing it, whose name goes last (so it's the first into "+N") */
  people: { name: string; color?: PersonColor; organiser?: boolean }[];
  /** e.g. "3 people · split by item" */
  detail: string;
  /** the receipt's heading (default "TOTAL") */
  label?: string;
  /** words on the receipt in place of the total */
  headline?: string;
  /** a podium of the top five (fastest first) in place of the receipt */
  podium?: { name: string; color?: PersonColor; time: string }[];
  /** the button (default "See what you owe →") */
  cta?: string;
  /** the line at the bottom left (default "Tap to see what you owe and mark it paid") */
  tagline?: string;
}

/**
 * The link preview (LINE, Messenger…): a cloudy sky, the bill's date and title in
 * poster type on the left, the meadow along the bottom, and the total on a
 * paper receipt with the people and a "See what you owe" button.
 */
export async function shareImage(card: Card | null) {
  const [latin700, thai700, latin400, ext700, ext400, display, displayLatin1, displayLatinExt, displayThai, meadow, clouds] = await Promise.all([
    font("NotoSansThai-latin-700.woff"),
    font("NotoSansThai-thai-700.woff"),
    font("NotoSansThai-latin-400.woff"),
    font("NotoSans-latinext-700.woff"),
    font("NotoSans-latinext-400.woff"),
    font("Anybody-Expanded-Black.ttf"),
    // Accented letters (é, ü, ğ…), see DISPLAY.
    font("Anybody-Expanded-Black-latin1.ttf"),
    font("Anybody-Expanded-Black-latinext.ttf"),
    font("Kanit-ExtraBold-thai.woff"),
    readFile(join(process.cwd(), "assets/og/meadow.png")),
    readFile(join(process.cwd(), "assets/og/clouds.jpg")),
  ]);
  const money = card ? formatMoney(card.total, card.currency) : "";
  // "฿1,800.00" → big whole part, smaller decimals (like the app). The font
  // subset has no ฿, so the baht sign is drawn (BahtSign) instead.
  const baht = money.startsWith("฿");
  const m = /^(.*?)([.,]\d+)?$/.exec(baht ? money.slice(1) : money);
  const whole = m?.[1] ?? money;
  const cents = m?.[2] ?? "";
  // An iPhone can type "é" as e + a separate accent: join them, so the font's own É is used.
  const raw = card?.title.normalize("NFC");
  const title = (raw ? (raw.length > 40 ? `${raw.slice(0, 38)}…` : raw) : "Bill Splitter").toUpperCase();
  // Poster letters are about 1em wide: the longest word has to fit the column whole
  // (narrower beside the wide podium paper).
  const column = card?.podium ? 1200 - 128 - 48 - PODIUM_W : 568;
  const longestWord = Math.max(1, ...(title.match(/[^\s฀-๿]+/g) ?? []).map((w) => [...w].length));
  const titleSize = Math.min(title.length <= 12 ? 58 : title.length <= 24 ? 46 : 36, Math.floor(column / (longestWord * 1.1)));
  // How many lines the title wraps to, word by word (poster letters are about 1em wide).
  const titleLines = wrappedLines(title, (n) => n * titleSize * 1.03, column);
  // Poster digits are wide: the longer the amount, the smaller, so it stays on the receipt.
  const moneySize = whole.length <= 5 ? 56 : whole.length <= 7 ? 44 : 36;
  const cta = (card ? (card.cta ?? "See what you owe →") : "Split a bill →").replace(/\s*→$/, "");

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
          position: "relative",
          background: "#A9D8F4",
          fontFamily: BODY,
          color: INK,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/jpeg;base64,${clouds.toString("base64")}`} width={1200} height={630} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${meadow.toString("base64")}`} width={1200} height={345} alt="" style={{ position: "absolute", left: 0, bottom: -72 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: 44, padding: "52px 0 0", color: ON_GREEN }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
            <div style={{ display: "flex", padding: 3, borderRadius: 16, background: "#ffffff" }}>
              <LogoMark px={56} />
            </div>
            Bill Splitter
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: DISPLAY, fontSize: titleSize, fontWeight: 900, lineHeight: 1.04 }}>{title}</div>
            {(card ? card.kicker : "Split the bill with friends") && (
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 12 }}>{card ? card.kicker : "Split the bill with friends"}</div>
            )}
            {/* A title on three lines would push this line into the chess queen. */}
            {titleLines < 3 && (
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 14 }}>
                {card ? (card.tagline ?? "Tap to see what you owe and mark it paid") : "Scan the receipt, share one link"}
              </div>
            )}
          </div>
        </div>

        {card?.podium ? (
          <Podium places={card.podium} cta={cta} />
        ) : (
        <div style={{ width: paper, display: "flex", flexDirection: "column", margin: "44px 0 40px" }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "40px 36px 28px",
              borderRadius: "12px 12px 0 0",
              background: "#ffffff",
              boxShadow: "0 24px 50px -16px rgba(3,20,30,0.55)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 900, color: INK_2 }}>{card?.label ?? "TOTAL"}</div>
              {dashes}
              {card?.headline ? (
                <div style={{ display: "flex", maxWidth: 380, fontSize: card.headline.length > 14 ? 40 : 52, fontWeight: 700, lineHeight: 1.1, textAlign: "center", color: ACCENT }}>
                  {card.headline}
                </div>
              ) : card ? (
                <div style={{ display: "flex", alignItems: "baseline", fontFamily: DISPLAY, fontWeight: 900, color: ACCENT }}>
                  {baht && <BahtSign size={moneySize * 0.62} color={ACCENT} />}
                  <div style={{ fontSize: moneySize, lineHeight: 1 }}>{whole}</div>
                  <div style={{ fontSize: moneySize * 0.5 }}>{cents}</div>
                </div>
              ) : (
                <div style={{ fontSize: 40, fontWeight: 700, color: ACCENT }}>Split it fairly</div>
              )}
              {dashes}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <Avatars people={[...(card?.people ?? []).filter((p) => !p.organiser), ...(card?.people ?? []).filter((p) => p.organiser)]} />
                {card && card.people.length > 0 && (
                  <div style={{ maxWidth: paper - 72, fontSize: 28, fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {cardNames(card.people)}
                  </div>
                )}
                {card && <div style={{ fontSize: 26, color: INK_2, marginTop: -6 }}>{card.detail}</div>}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                alignSelf: "stretch",
                height: 64,
                borderRadius: 12,
                background: GREEN,
                color: ON_GREEN,
                fontSize: 27,
                fontWeight: 700,
                gap: 12,
              }}
            >
              {cta}
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={ON_GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          </div>
          {/* Scalloped bottom edge of the receipt. */}
          <div style={{ display: "flex", marginTop: -bump / 2, height: bump }}>
            {Array.from({ length: paper / bump }, (_, i) => (
              <div key={i} style={{ width: bump, height: bump, borderRadius: bump, background: "#ffffff" }} />
            ))}
          </div>
        </div>
        )}
      </div>
    ),
    {
      ...shareImageSize,
      fonts: [
        { name: "Noto", data: latin700, weight: 700, style: "normal" },
        { name: "NotoThai", data: thai700, weight: 700, style: "normal" },
        { name: "Noto", data: latin400, weight: 400, style: "normal" },
        { name: "NotoExt", data: ext700, weight: 700, style: "normal" },
        { name: "NotoExt", data: ext400, weight: 400, style: "normal" },
        { name: "Display", data: display, weight: 900, style: "normal" },
        { name: "DisplayLatin1", data: displayLatin1, weight: 900, style: "normal" },
        { name: "DisplayLatinExt", data: displayLatinExt, weight: 900, style: "normal" },
        { name: "DisplayThai", data: displayThai, weight: 900, style: "normal" },
      ],
    },
  );
}

/**
 * The people's names for the receipt: "Boss, Mint, Ploy", or "Boss, Mint +3"
 * when they don't fit in about `max` characters (one line on the receipt).
 */
export function nameLine(names: string[], max = 24): string {
  const all = names.map((n) => n.trim()).filter(Boolean);
  const len = (s: string) => [...s].length;
  let line = "";
  for (let i = 0; i < all.length; i++) {
    const next = line ? `${line}, ${all[i]}` : all[i];
    const after = all.length - i - 1;
    if (line && len(next) + (after > 0 ? ` +${after}`.length : 0) > max) return `${line} +${all.length - i}`;
    line = next;
  }
  return line;
}

/** Lines a text wraps to at word breaks, given the width of n letters. */
export function wrappedLines(text: string, width: (letters: number) => number, max: number): number {
  let lines = 1;
  let line = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = [...word].length;
    if (line > 0 && width(line + 1 + w) > max) {
      lines++;
      line = w;
    } else line += (line > 0 ? 1 : 0) + w;
  }
  return lines;
}

/** Friends first, the organiser last: "Boss, Mint, Isara", or "Boss, Mint, Ploy, Pim +1" when full. */

export function cardNames(people: Card["people"]): string {
  return nameLine([...people.filter((p) => !p.organiser), ...people.filter((p) => p.organiser)].map((p) => p.name));
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
          {nameInitial(p.name)}
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

/** Step heights by place. */
const STEP = [156, 120, 94, 70, 50];
const STEP_W = 100;
/** The podium's paper: wider than a receipt, so five steps have room. */
const PODIUM_W = 576;

/**
 * The top five on a podium, on the same paper as a bill's receipt: each friend's initial,
 * name and average time stand on their step, #1 crowned; each place has its colour (gold, silver, bronze, mint, sky). A place nobody
 * has reached yet is an empty step.
 */
function Podium({ places, cta }: { places: { name: string; color?: PersonColor; time: string }[]; cta: string }) {
  const width = PODIUM_W;
  const bump = 24;
  const short = (n: string) => ([...n].length > 10 ? `${[...n].slice(0, 9).join("")}…` : n);
  return (
    <div style={{ width, display: "flex", flexDirection: "column", margin: "44px 0 40px" }}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "34px 20px 28px",
          borderRadius: "12px 12px 0 0",
          background: "#ffffff",
          boxShadow: "0 24px 50px -16px rgba(3,20,30,0.55)",
        }}
      >
        <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 900, color: INK_2 }}>TOP 5</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          {PODIUM_ORDER.map((i) => {
            const p = places[i];
            const first = i === 0;
            return (
              <div key={i} style={{ width: STEP_W, display: "flex", flexDirection: "column", alignItems: "center" }}>
                {p && first && (
                  <svg width="44" height="32" viewBox="0 0 54 40" style={{ marginBottom: 4 }}>
                    <path d="M3 36 L7 8 L19 22 L27 2 L35 22 L47 8 L51 36 Z" fill="#F5C518" stroke="#B8860B" strokeWidth="3" strokeLinejoin="round" />
                  </svg>
                )}
                {p && (
                  <div
                    style={{
                      width: first ? 72 : 58,
                      height: first ? 72 : 58,
                      borderRadius: 40,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: COLOR_HEX[p.color ?? "slate"],
                      color: INK,
                      fontSize: first ? 34 : 27,
                      fontWeight: 700,
                    }}
                  >
                    {nameInitial(p.name)}
                  </div>
                )}
                {p && <div style={{ marginTop: 8, fontSize: first ? 24 : 20, fontWeight: 700, color: INK }}>{short(p.name)}</div>}
                {p && (
                  <div style={{ marginBottom: 8, fontSize: p.time.length > 10 ? 15 : 17, fontWeight: 700, whiteSpace: "nowrap", color: first ? INK : INK_2 }}>
                    {p.time}
                  </div>
                )}
                <div
                  style={{
                    width: STEP_W,
                    height: STEP[i],
                    display: "flex",
                    justifyContent: "center",
                    paddingTop: 8,
                    borderRadius: "10px 10px 0 0",
                    background: p ? PLACE_COLORS[i].fill : "#F2F2F7",
                    color: p ? PLACE_COLORS[i].ink : "#C7C7CC",
                    fontFamily: DISPLAY,
                    fontSize: first ? 46 : 34,
                    fontWeight: 900,
                  }}
                >
                  {String(i + 1)}
                </div>
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "stretch",
            height: 64,
            marginTop: 22,
            borderRadius: 12,
            background: GREEN,
            color: ON_GREEN,
            fontSize: 27,
            fontWeight: 700,
            gap: 12,
          }}
        >
          {cta}
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={ON_GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </div>
      </div>
      {/* Scalloped bottom edge, like the receipt. */}
      <div style={{ display: "flex", marginTop: -bump / 2, height: bump }}>
        {Array.from({ length: width / bump }, (_, i) => (
          <div key={i} style={{ width: bump, height: bump, borderRadius: bump, background: "#ffffff" }} />
        ))}
      </div>
    </div>
  );
}
