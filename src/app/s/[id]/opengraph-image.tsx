import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { calculate } from "@/lib/calc";
import { formatMoney } from "@/lib/money";
import { loadSplit } from "@/lib/server/splits";

export const alt = "Bill split summary";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const font = (f: string) => readFile(join(process.cwd(), "assets/fonts", f));

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await loadSplit(id);
  const [latin700, thai700, latin400] = await Promise.all([
    font("NotoSansThai-latin-700.woff"),
    font("NotoSansThai-thai-700.woff"),
    font("NotoSansThai-latin-400.woff"),
  ]);

  const title = s?.doc.title ?? "Bill Splitter";
  const c = s ? calculate(s.doc) : null;
  // Amount + ISO code (the subset font has no ฿ glyph, and codes work for every currency).
  const total = c && s ? `${formatMoney(c.total, s.doc.currency).replace(/^[^\d−-]+/, "")} ${s.doc.currency}` : "";
  const n = s?.doc.people.length ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #064e3b 0%, #047857 100%)",
          color: "white",
          fontFamily: "Noto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 36, opacity: 0.9 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "white",
              color: "#047857",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
              fontWeight: 700,
            }}
          >
            ÷
          </div>
          Bill Splitter
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.2, maxHeight: 160, overflow: "hidden" }}>
            {title.length > 60 ? `${title.slice(0, 57)}…` : title}
          </div>
          {s && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 28, marginTop: 24 }}>
              <div style={{ fontSize: 96, fontWeight: 700 }}>{total}</div>
              <div style={{ fontSize: 40, opacity: 0.9 }}>{`${n} ${n === 1 ? "person" : "people"}`}</div>
            </div>
          )}
        </div>
        <div style={{ fontSize: 30, opacity: 0.85 }}>Tap to see what you owe and mark it paid</div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Noto", data: latin700, weight: 700, style: "normal" },
        { name: "Noto", data: thai700, weight: 700, style: "normal" },
        { name: "Noto", data: latin400, weight: 400, style: "normal" },
      ],
    },
  );
}
