"use client";

import { useRef, type MouseEvent, type RefObject } from "react";

/** How long after the finger (or mouse) goes down on the button its click still counts. */
const PRESS_MS = 5_000;

/**
 * Props for a button that opens a hidden file input (the camera, photos, a backup file). It
 * opens only for a press that began on the button itself, or for the keyboard or a screen
 * reader (their clicks have no pointer and `detail` 0). On iPhones the end of a tap made
 * somewhere else, such as on Home while the new page appears, can arrive as a click on what is
 * under the finger by then, and that would open the camera unasked.
 */
export function usePickerButton(input: RefObject<HTMLInputElement | null>) {
  const pressedAt = useRef(0);
  return {
    onPointerDown: () => {
      pressedAt.current = Date.now();
    },
    onClick: (e: MouseEvent) => {
      const pressed = Date.now() - pressedAt.current < PRESS_MS;
      pressedAt.current = 0;
      if (pressed || e.detail === 0) input.current?.click();
    },
  };
}
