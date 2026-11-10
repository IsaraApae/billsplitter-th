import type { PersonColor } from "./types";

/** Muted avatar tag colours (dark text on top), shared by the app and the share image. */
export const COLOR_HEX: Record<PersonColor, string> = {
  emerald: "#93C79C",
  sky: "#86B2DE",
  violet: "#9F9DDA",
  rose: "#E39AB4",
  amber: "#E8AC72",
  teal: "#7FC4BD",
  indigo: "#92C1D1",
  slate: "#A9A9B0",
};

/**
 * "Who pays fastest" places 1–5: gold, silver, bronze, then the app's mint and a sky blue.
 * `fill` is the step (and rank badge); `ink` is the number on it (contrast over 7:1).
 * The same in light and dark, on the page and on the link preview.
 */
export const PLACE_COLORS: readonly { fill: string; ink: string }[] = [
  { fill: "#F5C518", ink: "#4A3500" },
  { fill: "#CFD6DD", ink: "#27313A" },
  { fill: "#E3A272", ink: "#3D1F08" },
  { fill: "#8ADDB5", ink: "#04261A" },
  { fill: "#9CCBF2", ink: "#0C3557" },
];

/** Where the places stand on the podium, left to right: 4th, 2nd, 1st, 3rd, 5th (page and link preview). */
export const PODIUM_ORDER: readonly number[] = [3, 1, 0, 2, 4];
