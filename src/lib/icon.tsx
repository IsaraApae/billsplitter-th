import { ImageResponse } from "next/og";

/** App icon: white ÷ on emerald, full-bleed so it also works as a maskable icon. */
export function iconResponse(px: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#059669",
          color: "white",
          fontSize: px * 0.62,
          fontWeight: 700,
        }}
      >
        ÷
      </div>
    ),
    { width: px, height: px },
  );
}
