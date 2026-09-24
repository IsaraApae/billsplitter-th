import "server-only";
import { del, put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { devImageDel, devImageGet, devImagePut } from "./redis";

// Vercel Blob when BLOB_READ_WRITE_TOKEN is set; an in-memory store in local
// dev so the feature can be tried without any setup; unavailable otherwise.
const blobReady = !!process.env.BLOB_READ_WRITE_TOKEN;
const devMode = !blobReady && process.env.NODE_ENV !== "production";

export const qrStorageReady = blobReady || devMode;

export async function storeQrImage(ownerId: string, bytes: Buffer, contentType: string): Promise<string> {
  if (blobReady) {
    const blob = await put(`qr/${ownerId}.jpg`, bytes, {
      access: "public",
      addRandomSuffix: true, // unguessable URL; each upload is a new file
      contentType,
      cacheControlMaxAge: 60 * 60 * 24 * 30,
    });
    return blob.url;
  }
  if (devMode) {
    const key = `${ownerId}-${randomBytes(6).toString("hex")}`;
    await devImagePut(key, `data:${contentType};base64,${bytes.toString("base64")}`);
    return `dev:${key}`;
  }
  throw new Error("QR storage is not configured (BLOB_READ_WRITE_TOKEN missing).");
}

export async function deleteQrImage(url: string | null): Promise<void> {
  if (!url) return;
  try {
    if (url.startsWith("dev:")) await devImageDel(url.slice(4));
    else if (blobReady) await del(url);
  } catch (e) {
    console.error("QR delete failed", e); // an orphaned file is harmless
  }
}

/** Streams the stored image back (same-origin, so pages can draw it on a canvas). */
export async function readQrImage(url: string): Promise<Response | null> {
  if (url.startsWith("dev:")) {
    const dataUrl = await devImageGet(url.slice(4));
    if (!dataUrl) return null;
    const [meta, b64] = dataUrl.split(",");
    return new Response(Buffer.from(b64, "base64"), { headers: { "Content-Type": meta.slice(5, meta.indexOf(";")) } });
  }
  if (!/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(url)) return null;
  const res = await fetch(url);
  if (!res.ok || !res.body) return null;
  return new Response(res.body, { headers: { "Content-Type": res.headers.get("content-type") ?? "image/jpeg" } });
}
