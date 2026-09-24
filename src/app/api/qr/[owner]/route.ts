import { jsonError, safely } from "@/lib/server/http";
import { readQrImage } from "@/lib/server/qrStore";
import { rateLimit } from "@/lib/server/ratelimit";
import { getOwner } from "@/lib/server/redis";

/** The owner's current QR image, served same-origin (so "Save QR" can draw it). */
export async function GET(req: Request, ctx: RouteContext<"/api/qr/[owner]">) {
  const limited = await rateLimit(req, "read");
  if (limited) return limited;
  const { owner } = await ctx.params;
  return safely(async () => {
    const rec = await getOwner(owner);
    if (!rec?.qrUrl) return jsonError(404, "not_found", "No QR image.");
    const img = await readQrImage(rec.qrUrl);
    if (!img) return jsonError(404, "not_found", "No QR image.");
    // Pages add ?v=<version>, so a replaced QR shows up immediately.
    img.headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
    img.headers.set("X-Content-Type-Options", "nosniff");
    return img;
  });
}
