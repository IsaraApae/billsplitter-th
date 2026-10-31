import { ImageResponse } from "next/og";

const GREEN = "#00B368";
const DARK = "#04261A";
const LIGHT = "#ffffff";

/**
 * The logo, on a 16-unit grid so it stays crisp down to a 16px favicon: a green
 * tile with a square-cut ÷ above two rows of a chessboard. scripts/make-art.py
 * draws the same grid for the static favicon files.
 */
export function LogoMark({ px }: { px: number }) {
  const u = px / 16;
  const block = (x: number, y: number, w: number, h: number, c: string) => (
    <div key={`${x}-${y}`} style={{ position: "absolute", left: x * u, top: y * u, width: w * u, height: h * u, background: c }} />
  );
  const squares = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 8; col++) squares.push(block(col * 2, 12 + row * 2, 2, 2, (col + row) % 2 ? DARK : LIGHT));
  }
  return (
    <div style={{ position: "relative", display: "flex", width: px, height: px, borderRadius: 3.5 * u, overflow: "hidden", background: GREEN }}>
      {block(7, 2, 2, 2, DARK)}
      {block(3, 5, 10, 2, DARK)}
      {block(7, 8, 2, 2, DARK)}
      {squares}
    </div>
  );
}

/** The logo as a PNG. */
export function iconResponse(px: number) {
  return new ImageResponse(<LogoMark px={px} />, { width: px, height: px });
}
