import { jsonError, safely } from "@/lib/server/http";
import { deleteQrImage, qrStorageReady, storeQrImage } from "@/lib/server/qrStore";
import { rateLimit } from "@/lib/server/ratelimit";
import { createOwner, getOwner, getOwnerForWrite, saveOwner, type OwnerRecord } from "@/lib/server/redis";

const MAX_BYTES = 1_500_000; // the client compresses to ~100–300 KB
const TYPES = ["image/jpeg", "image/png", "image/webp"];

function credentials(req: Request) {
  return {
    id: req.headers.get("x-owner-id") ?? "",
    token: req.headers.get("x-owner-token") ?? "",
  };
}

/** Upload or replace the device owner's PromptPay QR image. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  if (!qrStorageReady) {
    return jsonError(503, "not_configured", "QR uploads aren't set up yet (Vercel Blob is not connected).");
  }
  return safely(async () => {
    let file: File | null = null;
    try {
      const f = (await req.formData()).get("image");
      file = f instanceof File ? f : null;
    } catch {
      /* handled below */
    }
    if (!file) return jsonError(400, "bad_request", "No image was uploaded.");
    if (!TYPES.includes(file.type)) return jsonError(415, "bad_type", "Please upload a JPEG, PNG or WebP image.");
    if (file.size > MAX_BYTES) return jsonError(413, "too_large", "That image is too large.");

    const creds = credentials(req);
    let ownerId = creds.id;
    let newToken: string | undefined;
    let rec: OwnerRecord | "forbidden" | null = ownerId ? await getOwnerForWrite(ownerId, creds.token) : null;
    if (rec === "forbidden") return jsonError(403, "forbidden", "This QR belongs to another device.");
    if (!rec) {
      const created = await createOwner();
      ownerId = created.id;
      newToken = created.token;
      rec = await getOwner(ownerId);
      if (!rec) throw new Error("Owner record vanished");
    }

    const url = await storeQrImage(ownerId, Buffer.from(await file.arrayBuffer()), file.type);
    const old = rec.qrUrl;
    const next: OwnerRecord = { ...rec, qrUrl: url, version: rec.version + 1 };
    await saveOwner(ownerId, next);
    await deleteQrImage(old);
    return Response.json({ ownerId, token: newToken, version: next.version }, { status: newToken ? 201 : 200 });
  });
}

/** Remove the QR image (everywhere it is shown). */
export async function DELETE(req: Request) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  return safely(async () => {
    const { id, token } = credentials(req);
    const rec = id ? await getOwnerForWrite(id, token) : null;
    if (rec === "forbidden") return jsonError(403, "forbidden", "This QR belongs to another device.");
    if (!rec) return jsonError(404, "not_found", "No QR to remove.");
    await saveOwner(id, { ...rec, qrUrl: null, version: rec.version + 1 });
    await deleteQrImage(rec.qrUrl);
    return Response.json({ ok: true });
  });
}
