import "server-only";
import { cache } from "react";
import { getSplit, isValidId, storageReady } from "./redis";

/** Per-request cached loader shared by generateMetadata, the page and the OG image. */
export const loadSplit = cache(async (id: string) => {
  if (!isValidId(id) || !storageReady) return null;
  try {
    return await getSplit(id);
  } catch (e) {
    console.error("loadSplit failed", e);
    return null;
  }
});
