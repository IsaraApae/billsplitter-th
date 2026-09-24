// Minimal JPEG header reader: EXIF orientation + stored pixel size. Pure.

export interface JpegInfo {
  /** EXIF orientation 1–8 (1 = upright / unknown) */
  orientation: number;
  /** Pixel size as stored in the file (before applying orientation) */
  width: number;
  height: number;
}

export function readJpegInfo(buf: ArrayBuffer): JpegInfo | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let orientation = 1;
  let width = 0;
  let height = 0;
  let off = 2;
  while (off + 4 <= v.byteLength) {
    if (v.getUint8(off) !== 0xff) return null;
    const marker = v.getUint8(off + 1);
    if (marker === 0xd9 || marker === 0xda) break; // end of image / start of scan
    const len = v.getUint16(off + 2);
    const seg = off + 4;
    if (marker === 0xe1 && seg + 6 <= v.byteLength && v.getUint32(seg) === 0x45786966) {
      orientation = readOrientation(v, seg + 6) ?? orientation; // "Exif\0\0"
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (seg + 5 <= v.byteLength) {
        height = v.getUint16(seg + 1);
        width = v.getUint16(seg + 3);
      }
    }
    off = seg + len - 2;
  }
  return { orientation, width, height };
}

function readOrientation(v: DataView, tiff: number): number | null {
  if (tiff + 8 > v.byteLength) return null;
  const little = v.getUint16(tiff) === 0x4949;
  const ifd = tiff + v.getUint32(tiff + 4, little);
  if (ifd + 2 > v.byteLength) return null;
  const count = v.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > v.byteLength) return null;
    if (v.getUint16(entry, little) === 0x0112) {
      const o = v.getUint16(entry + 8, little);
      return o >= 1 && o <= 8 ? o : null;
    }
  }
  return null;
}

/** Orientations 5–8 swap width and height. */
export const swapsAxes = (orientation: number) => orientation >= 5 && orientation <= 8;
