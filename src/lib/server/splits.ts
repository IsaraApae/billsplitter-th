import "server-only";
import { cache } from "react";
import { getSplit, isValidId, storageReady } from "./redis";

/**
 * Per-request cached loader shared by generateMetadata, the page and the OG image.
 * null means there's no such split; a storage failure throws, so the page shows an
 * error to retry rather than telling people their bill has expired.
 */
export const loadSplit = cache(async (id: string) => {
  if (!isValidId(id) || !storageReady) return null;
  return getSplit(id);
});
