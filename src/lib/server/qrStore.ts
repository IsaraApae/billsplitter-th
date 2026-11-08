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

/**
 * This deployment's own Blob store hosts, the way @vercel/blob builds them:
 * `<store id without "store_">.public.blob.vercel-storage.com`, from BLOB_STORE_ID
 * or the store id inside BLOB_READ_WRITE_TOKEN (`vercel_blob_rw_<id>_<secret>`).
 */
function ownBlobHosts(): Set<string> {
  const ids = [process.env.BLOB_STORE_ID?.trim(), process.env.BLOB_READ_WRITE_TOKEN?.trim().split("_")[3]];
  return new Set(
    ids.filter((id): id is string => !!id).map((id) => `${id.replace(/^store_/, "")}.public.blob.vercel-storage.com`.toLowerCase()),
  );
}

/**
 * True for a picture this app stored: a dev: key in local dev, or a URL in this
 * deployment's own Blob store. Any other store's files are someone else's, and
 * must never be served from this site.
 */
export function isOwnImageUrl(url: string): boolean {
  if (url.startsWith("dev:")) return devMode;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ownBlobHosts().has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Drops a receipt photo that isn't one of ours, so a split can't point at someone else's file. */
export function keepOwnPhoto<T extends { photo?: string }>(doc: T): T {
  if (doc.photo && !isOwnImageUrl(doc.photo)) doc.photo = undefined;
  return doc;
}

/** The only types ever stored; anything else (HTML, SVG…) is refused. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_READ_BYTES = 5_000_000;

/** Headers for a picture served same-origin: always an image, never a page. */
function imageHeaders(contentType: string): Headers {
  return new Headers({
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
}

/** Streams the stored image back (same-origin, so pages can draw it on a canvas). */
export async function readQrImage(url: string): Promise<Response | null> {
  if (!isOwnImageUrl(url)) return null;
  if (url.startsWith("dev:")) {
    const dataUrl = await devImageGet(url.slice(4));
    if (!dataUrl) return null;
    const [meta, b64] = dataUrl.split(",");
    const type = meta.slice(5, meta.indexOf(";"));
    if (!IMAGE_TYPES.has(type)) return null;
    return new Response(Buffer.from(b64, "base64"), { headers: imageHeaders(type) });
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const size = Number(res.headers.get("content-length") ?? 0);
  if (!res.ok || !res.body || !IMAGE_TYPES.has(type) || size > MAX_READ_BYTES) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  return new Response(res.body, { headers: imageHeaders(type) });
}
