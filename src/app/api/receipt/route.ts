import { jsonError, safely } from "@/lib/server/http";
import { qrStorageReady, readQrImage, storeReceiptImage } from "@/lib/server/qrStore";
import { rateLimit } from "@/lib/server/ratelimit";
import { RECEIPT_PHOTO_RE } from "@/lib/schema";

const MAX_BYTES = 1_500_000; // the client sends a ~1600px JPEG, usually 200–500 KB

/** Store a receipt photo for a split's shared page. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  if (!qrStorageReady) return jsonError(503, "not_configured", "Photo uploads aren't set up (Vercel Blob is not connected).");
  return safely(async () => {
    let file: File | null = null;
    try {
      const f = (await req.formData()).get("image");
      file = f instanceof File ? f : null;
    } catch {
      /* handled below */
    }
    if (!file) return jsonError(400, "bad_request", "No image was uploaded.");
    if (file.type !== "image/jpeg") return jsonError(415, "bad_type", "Please upload a JPEG.");
    if (file.size > MAX_BYTES) return jsonError(413, "too_large", "That photo is too large.");
    const photo = await storeReceiptImage(Buffer.from(await file.arrayBuffer()));
    return Response.json({ photo }, { status: 201 });
  });
}

/** The photo, served same-origin (`?src=` is the value stored on the split). */
export async function GET(req: Request) {
  const limited = await rateLimit(req, "read");
  if (limited) return limited;
  const src = new URL(req.url).searchParams.get("src") ?? "";
  if (!RECEIPT_PHOTO_RE.test(src)) return jsonError(404, "not_found", "No such photo.");
  return safely(async () => {
    const img = await readQrImage(src);
    if (!img) return jsonError(404, "not_found", "No such photo.");
    // Each upload has its own unguessable URL, so it never changes.
    img.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    img.headers.set("X-Content-Type-Options", "nosniff");
    return img;
  });
}
