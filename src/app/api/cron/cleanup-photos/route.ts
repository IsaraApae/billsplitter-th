import { jsonError, safely } from "@/lib/server/http";
import { deleteImages, listReceiptImages } from "@/lib/server/qrStore";
import { rateLimit } from "@/lib/server/ratelimit";
import { forgetPhoto, photoInUse } from "@/lib/server/redis";

export const maxDuration = 60;

// A photo picked for a draft is stored before the split is shared, so give
// drafts a month before an unshared photo counts as unused.
const GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Daily (vercel.json): deletes receipt photos no live split shows any more —
 * the split expired, the photo was removed or replaced, or it was never shared.
 * With CRON_SECRET set, only Vercel Cron can run it; without, running it early
 * is harmless (it only ever deletes unused photos).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError(401, "unauthorized", "Not allowed.");
  }
  if (!secret) {
    const limited = await rateLimit(req, "write");
    if (limited) return limited;
  }
  return safely(async () => {
    const photos = await listReceiptImages();
    const old = photos.filter((p) => Date.now() - p.uploadedAt.getTime() > GRACE_MS);
    const unused: string[] = [];
    for (const p of old) if (!(await photoInUse(p.url))) unused.push(p.url);
    await deleteImages(unused);
    await Promise.all(unused.map(forgetPhoto));
    console.info("[cleanup-photos]", { stored: photos.length, checked: old.length, deleted: unused.length });
    return Response.json({ stored: photos.length, checked: old.length, deleted: unused.length });
  });
}
