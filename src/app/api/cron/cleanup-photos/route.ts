import { timingSafeEqual } from "node:crypto";
import { jsonError, safely } from "@/lib/server/http";
import { deleteImages, listReceiptImages } from "@/lib/server/qrStore";
import { claimCleanupRun, forgetPhoto, photoInUse } from "@/lib/server/redis";

export const maxDuration = 60;

// A photo picked for a draft is stored before the split is shared, so give
// drafts a month before an unshared photo counts as unused.
const GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const SLIP_MAX_AGE_MS = 200 * 24 * 60 * 60 * 1000;
/** Stop starting new batches in time to answer before maxDuration; the next run carries on. */
const BUDGET_MS = 45_000;
const BATCH = 25;
/** Without CRON_SECRET anyone can call this, so it runs at most this often. */
const UNGUARDED_EVERY_S = 6 * 60 * 60;

function hasSecret(req: Request, secret: string): boolean {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Daily (vercel.json): deletes receipt photos no live split shows any more —
 * the split expired, the photo was removed or replaced, or it was never shared.
 * With CRON_SECRET set, only Vercel Cron can run it; without, anyone can, but at
 * most once every few hours (each run lists the whole Blob store, which is billed).
 * Photos are checked and deleted a batch at a time, so a slow run still makes progress.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && !hasSecret(req, secret)) return jsonError(401, "unauthorized", "Not allowed.");
  return safely(async () => {
    if (!secret && !(await claimCleanupRun(UNGUARDED_EVERY_S))) {
      return jsonError(429, "rate_limited", "The clean-up ran recently.");
    }
    const started = Date.now();
    const inTime = () => Date.now() - started < BUDGET_MS;

    // Slip pictures are only for the organiser to look over; drop them after ~6 months.
    const slips = await listReceiptImages("slips/");
    const oldSlips = slips.filter((p) => started - p.uploadedAt.getTime() > SLIP_MAX_AGE_MS).map((p) => p.url);
    let slipsDeleted = 0;
    for (let i = 0; i < oldSlips.length && inTime(); i += 100) {
      const batch = oldSlips.slice(i, i + 100);
      await deleteImages(batch);
      slipsDeleted += batch.length;
    }

    const photos = await listReceiptImages();
    const old = photos.filter((p) => started - p.uploadedAt.getTime() > GRACE_MS);
    let checked = 0;
    let deleted = 0;
    for (let i = 0; i < old.length && inTime(); i += BATCH) {
      const batch = old.slice(i, i + BATCH);
      const inUse = await Promise.all(batch.map((p) => photoInUse(p.url)));
      const unused = batch.filter((_, j) => !inUse[j]).map((p) => p.url);
      if (unused.length) {
        await deleteImages(unused);
        await Promise.all(unused.map(forgetPhoto));
      }
      checked += batch.length;
      deleted += unused.length;
    }
    const result = { stored: photos.length, checked, deleted, slipsDeleted, finished: checked === old.length };
    console.info("[cleanup-photos]", result);
    return Response.json(result);
  });
}
