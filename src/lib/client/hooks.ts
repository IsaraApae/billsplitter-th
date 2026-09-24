"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/**
 * Read a browser-only primitive (navigator, location, localStorage) without a
 * hydration mismatch: the server snapshot is used for SSR and the first paint.
 */
export function useBrowserValue<T extends string | number | boolean | null>(get: () => T, server: T): T {
  return useSyncExternalStore(noSubscribe, get, () => server);
}
