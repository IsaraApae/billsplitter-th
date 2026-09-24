"use client";

import { readJpegInfo, swapsAxes } from "../jpeg";
import { findPaperBox, prepareForOcr } from "../paper";

const WORK_MAX = 3000; // working resolution (well under iOS canvas limits)

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Your browser couldn't process the image.");
  return { c, ctx };
}

async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; close: () => void }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => {} };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// Standard EXIF orientation transforms (w/h = drawn source size).
function applyOrientation(ctx: CanvasRenderingContext2D, o: number, w: number, h: number) {
  const t: Record<number, [number, number, number, number, number, number]> = {
    2: [-1, 0, 0, 1, w, 0],
    3: [-1, 0, 0, -1, w, h],
    4: [1, 0, 0, -1, 0, h],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, h, 0],
    7: [0, -1, -1, 0, h, w],
    8: [0, -1, 1, 0, 0, w],
  };
  if (t[o]) ctx.transform(...t[o]);
}

/**
 * Decodes the photo upright. Modern browsers apply EXIF rotation themselves;
 * if one didn't (decoded size still equals the stored, unrotated size of a
 * sideways photo) we rotate manually.
 */
export async function loadUpright(file: Blob): Promise<HTMLCanvasElement> {
  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error("Couldn't read this image. Try a JPEG or PNG, or take a new photo.");
  }
  let orientation = 1;
  if (file.type === "image/jpeg" || file.type === "") {
    const info = readJpegInfo(await file.slice(0, 256 * 1024).arrayBuffer());
    if (info && swapsAxes(info.orientation) && info.width !== info.height &&
        decoded.w === info.width && decoded.h === info.height) {
      orientation = info.orientation;
    }
  }
  const scale = Math.min(1, WORK_MAX / Math.max(decoded.w, decoded.h));
  const dw = Math.max(1, Math.round(decoded.w * scale));
  const dh = Math.max(1, Math.round(decoded.h * scale));
  const swap = swapsAxes(orientation);
  const { c, ctx } = canvas(swap ? dh : dw, swap ? dw : dh);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  applyOrientation(ctx, orientation, dw, dh);
  ctx.drawImage(decoded.src, 0, 0, dw, dh);
  decoded.close();
  return c;
}

function scaled(src: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height));
  if (s === 1) return src;
  const { c, ctx } = canvas(Math.round(src.width * s), Math.round(src.height * s));
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function toJpeg(c: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't compress the image."))), "image/jpeg", quality),
  );
}

/** Upright JPEG for Gemini: long edge ~2048px, quality 0.85. */
export async function uploadJpeg(upright: HTMLCanvasElement): Promise<Blob> {
  return toJpeg(scaled(upright, 2048), 0.85);
}

/** Generic compress (e.g. the PromptPay QR image). */
export async function compressImage(file: Blob, maxSide = 1024, quality = 0.9): Promise<Blob> {
  return toJpeg(scaled(await loadUpright(file), maxSide), quality);
}

/**
 * Image for on-device OCR: cropped to the receipt paper (drops table,
 * bottles, packaging), scaled so text is ~30px tall, greyscale + stretched
 * contrast. Returns whether a crop was found.
 */
export function ocrCanvas(upright: HTMLCanvasElement): { canvas: HTMLCanvasElement; cropped: boolean } {
  const small = scaled(upright, 320);
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  const box = findPaperBox(sctx.getImageData(0, 0, small.width, small.height).data, small.width, small.height);
  const k = upright.width / small.width;
  const sx = box ? Math.round(box.x * k) : 0;
  const sy = box ? Math.round(box.y * k) : 0;
  const sw = box ? Math.min(upright.width - sx, Math.round(box.w * k)) : upright.width;
  const sh = box ? Math.min(upright.height - sy, Math.round(box.h * k)) : upright.height;
  const targetW = box ? 1400 : Math.min(2048, sw);
  const s = Math.min(targetW / sw, 4000 / sh);
  const { c, ctx } = canvas(Math.round(sw * s), Math.round(sh * s));
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(upright, sx, sy, sw, sh, 0, 0, c.width, c.height);

  // Greyscale → flatten shadows → contrast stretch. Done by hand because
  // canvas filters aren't available in every Safari version.
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const gray = new Uint8ClampedArray(c.width * c.height);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) gray[p] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  prepareForOcr(gray, c.width, c.height);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) d[i] = d[i + 1] = d[i + 2] = gray[p];
  ctx.putImageData(img, 0, 0);
  return { canvas: c, cropped: !!box };
}
