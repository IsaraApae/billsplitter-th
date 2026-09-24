"use client";

async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { src: bmp, w: bmp.width, h: bmp.height };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { src: img, w: img.naturalWidth, h: img.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Resize so the longest side is ≤ maxSide and re-encode as JPEG. */
export async function compressImage(file: Blob, maxSide = 1600, quality = 0.82): Promise<Blob> {
  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error("Couldn't read this image. Try a JPEG or PNG, or take a new photo.");
  }
  const scale = Math.min(1, maxSide / Math.max(decoded.w, decoded.h));
  const w = Math.max(1, Math.round(decoded.w * scale));
  const h = Math.max(1, Math.round(decoded.h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't process the image.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(decoded.src, 0, 0, w, h);
  if ("close" in decoded.src && typeof decoded.src.close === "function") decoded.src.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (!blob) throw new Error("Your browser couldn't compress the image.");
  return blob;
}
