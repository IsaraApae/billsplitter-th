// Finds the receipt (white, unsaturated paper) in a photo so the on-device OCR
// only sees the receipt — not the table, bottles or packaging around it. Pure.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Flattens uneven lighting (shadows across a receipt) in place, like a
 * document scanner: estimate the paper brightness per tile (a high
 * percentile, so text doesn't count), smooth it, and divide it out.
 * `gray` holds one 0–255 value per pixel.
 */
export function flattenLighting(gray: Uint8ClampedArray | Uint8Array, width: number, height: number, tile = 32): void {
  const tx = Math.ceil(width / tile);
  const ty = Math.ceil(height / tile);
  const bg = new Float32Array(tx * ty);
  const hist = new Uint32Array(256);
  for (let j = 0; j < ty; j++) {
    for (let i = 0; i < tx; i++) {
      hist.fill(0);
      let n = 0;
      for (let y = j * tile; y < Math.min(height, (j + 1) * tile); y++) {
        for (let x = i * tile; x < Math.min(width, (i + 1) * tile); x++) {
          hist[gray[y * width + x]]++;
          n++;
        }
      }
      // 90th percentile ≈ paper brightness in this tile.
      let acc = 0;
      let v = 255;
      for (; v > 0; v--) if ((acc += hist[v]) >= n * 0.1) break;
      bg[j * tx + i] = Math.max(v, 40);
    }
  }
  // Smooth the background map (3×3 mean) so tile edges don't show.
  const sm = new Float32Array(tx * ty);
  for (let j = 0; j < ty; j++) {
    for (let i = 0; i < tx; i++) {
      let s = 0;
      let c = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const jj = j + dj;
          const ii = i + di;
          if (jj >= 0 && jj < ty && ii >= 0 && ii < tx) {
            s += bg[jj * tx + ii];
            c++;
          }
        }
      }
      sm[j * tx + i] = s / c;
    }
  }
  // Bilinear interpolation of the map, then divide.
  for (let y = 0; y < height; y++) {
    const fy = Math.min(ty - 1, Math.max(0, y / tile - 0.5));
    const j0 = Math.floor(fy);
    const j1 = Math.min(ty - 1, j0 + 1);
    const wy = fy - j0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(tx - 1, Math.max(0, x / tile - 0.5));
      const i0 = Math.floor(fx);
      const i1 = Math.min(tx - 1, i0 + 1);
      const wx = fx - i0;
      const b =
        sm[j0 * tx + i0] * (1 - wx) * (1 - wy) +
        sm[j0 * tx + i1] * wx * (1 - wy) +
        sm[j1 * tx + i0] * (1 - wx) * wy +
        sm[j1 * tx + i1] * wx * wy;
      const p = y * width + x;
      gray[p] = Math.min(255, Math.round((gray[p] * 245) / b));
    }
  }
}

/** Shared by the browser and the diagnostic script: flatten lighting, then stretch contrast (1st–99th pct). */
export function prepareForOcr(gray: Uint8ClampedArray | Uint8Array, width: number, height: number): void {
  flattenLighting(gray, width, height);
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  let lo = 0;
  let hi = 255;
  let acc = 0;
  for (let v = 0; v < 256; v++) if ((acc += hist[v]) >= gray.length * 0.01) { lo = v; break; }
  acc = 0;
  for (let v = 255; v >= 0; v--) if ((acc += hist[v]) >= gray.length * 0.01) { hi = v; break; }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.max(0, Math.min(255, ((gray[i] - lo) * 255) / range));
}

/** Otsu threshold of a 0–255 histogram. */
function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * `rgba` is a small (e.g. ≤ 320px) RGBA image. Returns the bounding box of the
 * largest connected region of paper-like pixels, in that image's coordinates,
 * or null when nothing receipt-like stands out.
 */
export function findPaperBox(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Box | null {
  const n = width * height;
  const white = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Bright and unsaturated = paper. Beige wood or coloured labels score low.
    const v = Math.max(0, min - (max - min));
    white[i] = v;
    hist[v]++;
  }
  // Paper is the brightest, least saturated thing in frame: stay close to the
  // 98th percentile so light tables/walls don't merge with the receipt.
  let acc = 0;
  let p98 = 255;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= n * 0.02) {
      p98 = v;
      break;
    }
  }
  const t = Math.max(otsu(hist, n), Math.round(p98 * 0.8), 120);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = white[i] > t ? 1 : 0;

  // Close small gaps (printed text) so the paper stays one region.
  const closed = new Uint8Array(n);
  const r = Math.max(1, Math.round(Math.min(width, height) / 100));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 0;
      for (let dy = -r; dy <= r && !on; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < width && mask[yy * width + xx]) {
            on = 1;
            break;
          }
        }
      }
      closed[y * width + x] = on;
    }
  }

  // Largest 4-connected component.
  const label = new Int32Array(n).fill(-1);
  let best: Box | null = null;
  let bestSize = 0;
  const stack: number[] = [];
  for (let start = 0; start < n; start++) {
    if (!closed[start] || label[start] !== -1) continue;
    let size = 0;
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    stack.push(start);
    label[start] = start;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % width;
      const y = (p - x) / width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const nb = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of nb) {
        if (q >= 0 && closed[q] && label[q] === -1) {
          label[q] = start;
          stack.push(q);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
  }

  if (!best) return null;
  const area = best.w * best.h;
  // Too small to be the receipt, or basically the whole frame (nothing to crop).
  if (area < n * 0.05 || area > n * 0.92) return null;
  // Pad a little so edge characters aren't clipped.
  const pad = Math.round(Math.max(width, height) * 0.004);
  const x = Math.max(0, best.x - pad);
  const y = Math.max(0, best.y - pad);
  return { x, y, w: Math.min(width - x, best.w + 2 * pad), h: Math.min(height - y, best.h + 2 * pad) };
}
