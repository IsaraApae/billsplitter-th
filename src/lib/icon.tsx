import { ImageResponse } from "next/og";

// Top to bottom, ending in the scallops' colour so the edge is seamless.
const GREEN = "linear-gradient(180deg, #10b981 0%, #047857 100%)";

/** ÷ drawn with shapes (crisp at any size, no font needed). */
function Divide({ size, color }: { size: number; color: string }) {
  const dot = size * 0.27;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: dot, height: dot, borderRadius: dot, background: color }} />
      <div style={{ width: size, height: size * 0.19, borderRadius: size, background: color, margin: `${size * 0.15}px 0` }} />
      <div style={{ width: dot, height: dot, borderRadius: dot, background: color }} />
    </div>
  );
}

/**
 * The logo: a green receipt with a white ÷ on a white tile with a soft green
 * glow. Full-bleed so it also works as a maskable icon. `bare` leaves out the
 * tile (just the receipt on a transparent background, for the share card).
 */
export function LogoMark({ px, bare = false }: { px: number; bare?: boolean }) {
  const w = px * 0.56;
  const h = px * 0.62;
  const bump = w / 4;
  return (
    <div
      style={{
        width: px,
        height: px,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...(bare
          ? {}
          : {
              background:
                "radial-gradient(circle at 50% 110%, rgba(52,211,153,0.30), rgba(52,211,153,0) 60%), radial-gradient(circle at 0% 0%, rgba(20,184,166,0.14), rgba(20,184,166,0) 50%), #ffffff",
            }),
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: -px * 0.04 }}>
        <div
          style={{
            width: w,
            height: h,
            borderRadius: `${px * 0.07}px ${px * 0.07}px 0 0`,
            background: GREEN,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Divide size={px * 0.3} color="#ffffff" />
        </div>
        {/* Scalloped bottom edge of the receipt. */}
        <div style={{ display: "flex" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ width: bump, height: bump / 2, borderRadius: `0 0 ${bump}px ${bump}px`, background: "#047857" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The logo as a PNG. `tile`: on its white tile (for icons that can't be
 * transparent: Android's maskable icon); otherwise just the receipt on a
 * transparent background, filling most of the square.
 */
export function iconResponse(px: number, { tile = false }: { tile?: boolean } = {}) {
  return new ImageResponse(
    tile ? (
      <LogoMark px={px} />
    ) : (
      // Nudged down a little so the receipt (with its scalloped edge) sits in the middle.
      <div style={{ width: px, height: px, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", paddingTop: px * 0.05 }}>
        <LogoMark px={px * 1.3} bare />
      </div>
    ),
    { width: px, height: px },
  );
}
