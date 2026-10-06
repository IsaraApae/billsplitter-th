import "server-only";
import { del, list, put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { devImageDel, devImageGet, devImagePut } from "./redis";

// Vercel Blob when configured — either a BLOB_READ_WRITE_TOKEN, or (newer
// stores) BLOB_STORE_ID + Vercel's automatic OIDC token, which @vercel/blob
// picks up by itself. An in-memory store in local dev; unavailable otherwise.
const blobReady = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
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

/** A receipt photo shown on a split's shared page (or a friend's slip). Returns its URL (or a dev: key). */
export async function storeReceiptImage(bytes: Buffer, kind: "receipts" | "slips" = "receipts"): Promise<string> {
  if (blobReady) {
    const blob = await put(`${kind}/${kind === "slips" ? "slip" : "receipt"}.jpg`, bytes, {
      access: "public",
      addRandomSuffix: true, // unguessable URL
      contentType: "image/jpeg",
      cacheControlMaxAge: 60 * 60 * 24 * 30,
    });
    return blob.url;
  }
  if (devMode) {
    const key = `${kind === "slips" ? "s" : "r"}-${randomBytes(8).toString("hex")}`;
    await devImagePut(key, `data:image/jpeg;base64,${bytes.toString("base64")}`);
    return `dev:${key}`;
  }
  throw new Error("Image storage is not configured (BLOB_READ_WRITE_TOKEN missing).");
}

/** Every stored receipt photo (Vercel Blob only; nothing to clean up in local dev). */
export async function listReceiptImages(prefix: "receipts/" | "slips/" = "receipts/"): Promise<{ url: string; uploadedAt: Date }[]> {
  if (!blobReady) return [];
  const all: { url: string; uploadedAt: Date }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    all.push(...page.blobs.map((b) => ({ url: b.url, uploadedAt: new Date(b.uploadedAt) })));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return all;
}

export async function deleteImages(urls: string[]): Promise<void> {
  if (blobReady && urls.length) await del(urls);
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
