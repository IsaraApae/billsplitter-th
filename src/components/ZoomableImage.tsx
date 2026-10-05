"use client";

import { useState } from "react";
import { cx } from "./ui";

/** Pinch/scroll to pan; buttons to zoom (works the same on iOS and Android). */
export function ZoomableImage({ src }: { src: string }) {
  const [scale, setScale] = useState(1);
  return (
    <div className="space-y-3">
      <div className="max-h-[68dvh] overflow-auto rounded-[22px] bg-white [touch-action:pan-x_pan-y_pinch-zoom]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Receipt photo" style={{ width: `${scale * 100}%`, maxWidth: "none" }} className="block" />
      </div>
      <div className="flex justify-center gap-2" role="group" aria-label="Zoom">
        {[1, 2, 3].map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={scale === s}
            onClick={() => setScale(s)}
            className={cx(scale === s ? "chip-on" : "chip", "justify-center px-5")}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
