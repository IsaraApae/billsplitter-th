#!/usr/bin/env python3
"""Draws the app's artwork from code (no source images): the scene at the top of
pages (sky, checkerboard, chess pieces, a retro computer showing ÷, flowers), the
meadow at the end of pages and on the share cards, and the cards' cloudy sky. Also draws the favicon files.

Usage: python3 scripts/make-art.py   (needs numpy and Pillow; cwebp is optional)
Writes public/scene/{day,night}-{1800,1000}.webp, public/meadow/{day,night}.webp,
assets/og/{clouds.jpg,meadow.png} and the icons.
"""
import math
import os
import shutil
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 2200, 460
SS = 2


def rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255


def u8(c):
    return tuple(int(max(0, min(1, v)) * 255) for v in c)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def layer():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


# ---------- Grass ------------------------------------------------------------
def patch_noise(rng):
    """Slow variation along the meadow, so patches differ in colour and height."""
    pts = rng.random(40)
    return lambda x: float(np.interp(x / W * 39, np.arange(40), pts))


def grass(rng, n, y0, y1, length, width, dark, mid, tip, patch, dry=0.03, blur=0.0, xspan=(-40, W + 40)):
    out = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    dark, mid, tip = rgb(dark), rgb(mid), rgb(tip)
    straw = rgb("#C9B458")
    rows = sorted(range(n), key=lambda _: rng.random())
    for _ in rows:
        x = rng.uniform(*xspan)
        p = patch(x)
        y = rng.uniform(y0, y1)
        ln = length * rng.uniform(0.5, 1.15) * (0.72 + p * 0.5)
        lean = rng.normal(0, 0.3) * ln
        droop = rng.uniform(0.05, 0.28) * ln * np.sign(lean or 1)
        wid = width * rng.uniform(0.6, 1.25)
        # Warmer or cooler by patch, a few dry blades.
        hue = mid + (tip - mid) * (p * 0.55 + rng.uniform(-0.1, 0.25))
        top = tip + (hue - tip) * rng.uniform(0.1, 0.7)
        if rng.random() < dry:
            top = straw
        segs = 12
        prev_l, prev_r = None, None
        for i in range(segs + 1):
            s = i / segs
            px = x + lean * s + droop * s * s * s
            py = y - ln * (s - 0.16 * s * s * s)
            w = wid * (1 - s**1.6) * (0.75 + 0.25 * math.sin(min(1, s * 4) * math.pi / 2))
            lp, rp = (px - w, py), (px + w, py)
            if prev_l:
                c = dark + (hue - dark) * min(1, s * 2.2) if s < 0.45 else hue + (top - hue) * ((s - 0.45) / 0.55)
                q = [(a * SS, b * SS) for a, b in (prev_l, lp, rp, prev_r)]
                d.polygon(q, fill=(*u8(c), 255))
                # A lit edge down one side of the blade.
                if s > 0.2:
                    d.line([(lp[0] * SS, lp[1] * SS), (prev_l[0] * SS, prev_l[1] * SS)], fill=(*u8(c + 0.12), 200), width=max(1, int(wid * 0.35)))
            prev_l, prev_r = lp, rp
    out = out.resize((W, H), Image.LANCZOS)
    return out.filter(ImageFilter.GaussianBlur(blur)) if blur else out


# ---------- Flowers ----------------------------------------------------------
def petal_img(pw, ph, base, tipc, notch, rng):
    """One petal, base at the bottom: teardrop outline, soft veins, curved shading."""
    ys, xs = np.mgrid[0:ph, 0:pw].astype(np.float32)
    u = (xs + 0.5) / pw * 2 - 1
    v = 1 - (ys + 0.5) / ph  # 0 at the base, 1 at the tip
    half = np.sin(np.pi * np.clip(v, 0, 1) ** 0.72) ** 0.62 * 0.98
    edge = v + notch * np.abs(np.sin(u * 3.2)) * smooth(0.0, 1.0, v)
    mask = smooth(0, 0.05, half - np.abs(u)) * smooth(0, 0.012, 1 - notch - edge + notch)
    b, t = rgb(base), rgb(tipc)
    col = b[None, None] + (t - b)[None, None] * smooth(0.04, 0.72, v)[..., None]
    veins = 0.045 * np.cos(u * 17 + rng.uniform(0, 3)) * smooth(0.05, 0.4, v)
    curve = 0.74 + 0.3 * np.sqrt(np.clip(1 - u**2, 0, 1))
    crease = 1 - 0.14 * np.exp(-((u / 0.09) ** 2)) * (1 - v * 0.6)
    light = 0.86 + 0.24 * smooth(0.1, 0.8, v)
    shade = (curve * crease * light + veins)[..., None]
    col = np.clip(col * shade, 0, 1)
    return Image.fromarray((np.dstack([col, mask]) * 255).astype(np.uint8), "RGBA")


def head(size, kind, rng):
    k = 3
    box = int(size * 2.5) * k
    c = box / 2
    img = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    r = size * k
    rings = {
        "cosmos": [(1.0, 0.44, 8, 0.05)],
        "daisy": [(1.0, 0.2, 21, 0.03), (0.86, 0.2, 17, 0.03)],
        "zinnia": [(1.0, 0.36, 13, 0.02), (0.76, 0.32, 11, 0.02), (0.52, 0.27, 9, 0.02)],
    }[kind["shape"]]
    start = rng.uniform(0, 360)
    for ri, (rad, wid, n, notch) in enumerate(rings):
        pw, ph = max(4, int(r * wid * 2 * rad)), max(4, int(r * rad))
        for i in range(n):
            pet = petal_img(pw, ph, kind["base"], kind["tip"], notch, rng)
            sheet = Image.new("RGBA", (box, box), (0, 0, 0, 0))
            sheet.paste(pet, (int(c - pw / 2), int(c - ph * rng.uniform(0.96, 1.04))), pet)
            a = start + i * 360 / n + ri * 17 + rng.uniform(-5, 5)
            sheet = sheet.rotate(a, resample=Image.BICUBIC, center=(c, c))
            # Each petal shades whatever lies under it.
            alpha = sheet.getchannel("A").filter(ImageFilter.GaussianBlur(r * 0.035))
            shadow = Image.new("RGBA", (box, box), (20, 8, 4, 0))
            shadow.putalpha(alpha.point(lambda p: int(p * 0.42)))
            img.alpha_composite(shadow, (0, int(r * 0.012)))
            img.alpha_composite(sheet)
    # The centre: a dome of florets in a sunflower spiral.
    d = ImageDraw.Draw(img)
    rc = r * kind["core"]
    dome_dark, dome_lit = rgb(kind["core_dark"]), rgb(kind["core_lit"])
    d.ellipse((c - rc, c - rc, c + rc, c + rc), fill=(*u8(dome_dark * 0.7), 255))
    n = int(120 * (kind["core"] / 0.22))
    for i in range(n):
        t = i / n
        rr = rc * 0.97 * math.sqrt(t)
        ang = i * 2.39996
        px, py = c + rr * math.cos(ang), c + rr * math.sin(ang)
        lit = 1 - 0.75 * ((px - c + rc * 0.35) ** 2 + (py - c + rc * 0.4) ** 2) ** 0.5 / (rc * 1.5)
        col = dome_dark + (dome_lit - dome_dark) * max(0, min(1, lit * (0.45 + 0.75 * t)))
        dot = rc * 0.075 * (0.7 + 0.5 * t)
        d.ellipse((px - dot, py - dot, px + dot, py + dot), fill=(*u8(col), 255))
    img = img.resize((box // k, box // k), Image.LANCZOS)
    # Tilted towards the viewer a little, like a real flower head.
    squash = rng.uniform(0.74, 0.96)
    h2 = int(img.height * squash)
    img = img.resize((img.width, h2), Image.LANCZOS)
    return img.rotate(rng.uniform(-22, 22), resample=Image.BICUBIC, expand=True)


KINDS = {
    "orange": dict(shape="zinnia", base="#D2470F", tip="#FF9A2E", core=0.2, core_dark="#5A2A08", core_lit="#FFC83A"),
    "yellow": dict(shape="cosmos", base="#E79A06", tip="#FFE24A", core=0.24, core_dark="#6E3F06", core_lit="#FFB52E"),
    "purple": dict(shape="cosmos", base="#5A2BC4", tip="#B48CFF", core=0.2, core_dark="#7A4A08", core_lit="#FFD84A"),
    "white": dict(shape="daisy", base="#CFE0D2", tip="#FFFFFF", core=0.27, core_dark="#A9720A", core_lit="#FFD93A"),
    "coral": dict(shape="zinnia", base="#D93A5A", tip="#FF9AA0", core=0.2, core_dark="#5A2A08", core_lit="#FFCF4A"),
}


def stem_flower(lay, rng, x, y_ground, y_head, size, kind):
    """A flower on a curved stem, with a couple of leaves, drawn into `lay`."""
    big = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    lean = rng.uniform(-0.2, 0.2) * (y_ground - y_head)
    pts = []
    for i in range(21):
        s = i / 20
        pts.append((x + lean * s * s, y_ground + (y_head - y_ground) * s))
    wid = max(2.0, size * 0.055)
    dark, lit = rgb("#14572D"), rgb("#57A83E")
    for i in range(20):
        s = i / 20
        (a0, b0), (a1, b1) = pts[i], pts[i + 1]
        w = wid * (1.15 - 0.45 * s)
        c = dark + (lit - dark) * s
        d.polygon([((a0 - w) * SS, b0 * SS), ((a1 - w) * SS, b1 * SS), ((a1 + w) * SS, b1 * SS), ((a0 + w) * SS, b0 * SS)], fill=(*u8(c), 255))
        d.line([((a0 + w * 0.5) * SS, b0 * SS), ((a1 + w * 0.5) * SS, b1 * SS)], fill=(*u8(c + 0.14), 255), width=max(1, int(w * 0.5)))
    for side, at in [(-1, 0.3), (1, 0.52)]:
        ax, ay = pts[int(at * 20)]
        ln = size * rng.uniform(1.1, 1.7)
        ang = math.radians(rng.uniform(22, 48))
        L, R = [], []
        for i in range(13):
            s = i / 12
            px = ax + side * ln * s * math.cos(ang)
            py = ay - ln * s * math.sin(ang) + ln * 0.34 * s * s
            w = ln * 0.16 * math.sin(math.pi * s**0.75)
            L.append(((px) * SS, (py - w) * SS))
            R.append(((px) * SS, (py + w) * SS))
        d.polygon(L + R[::-1], fill=(*u8(rgb("#2F8B3F")), 255))
        d.polygon(L + [(q[0], q[1] - (q[1] - L[j][1]) * 0.45) for j, q in reversed(list(enumerate(R)))], fill=(*u8(rgb("#4BA647")), 255))
        d.line([((ax + side * ln * s / 12 * math.cos(ang)) * SS, (ay - ln * s / 12 * math.sin(ang) + ln * 0.34 * (s / 12) ** 2) * SS) for s in range(13)], fill=(*u8(rgb("#1B6B34")), 255), width=2)
    small = big.resize((W, H), Image.LANCZOS)
    lay.alpha_composite(small)
    hd = head(size, KINDS[kind], rng)
    ex, ey = int(x + lean - hd.width / 2), int(y_head - hd.height / 2)
    # Soft shadow of the head on what's behind it.
    sh = Image.new("RGBA", hd.size, (4, 20, 10, 0))
    sh.putalpha(hd.getchannel("A").filter(ImageFilter.GaussianBlur(size * 0.1)).point(lambda p: int(p * 0.35)))
    lay.alpha_composite(sh, (max(0, ex + 3), max(0, ey + int(size * 0.1)))) if ex + 3 >= 0 and ey >= -int(size * 0.1) else None
    paste_clip(lay, hd, ex, ey)


def paste_clip(dst, src, x, y):
    """alpha_composite that tolerates going off the canvas."""
    box = (max(0, -x), max(0, -y), min(src.width, dst.width - x), min(src.height, dst.height - y))
    if box[2] <= box[0] or box[3] <= box[1]:
        return
    dst.alpha_composite(src.crop(box), (max(0, x), max(0, y)))


# ---------- Chess pieces ------------------------------------------------------
def ellipse(t, tc, ht, rad):
    """A ball or ring on the axis: its radius (as a share of the height) at each row."""
    return rad * np.sqrt(np.clip(1 - ((t - tc) / ht) ** 2, 0, 1))


def curve(t, *pts):
    """A turned curve through (t, radius) points; nothing outside its span."""
    ts, rs = zip(*pts)
    r = np.interp(t, ts, rs)
    return np.where((t >= ts[0]) & (t <= ts[-1]), r, 0)


def pawn_profile(t):
    return np.maximum.reduce([
        ellipse(t, 0.155, 0.155, 0.15),  # the head, a true ball
        ellipse(t, 0.325, 0.024, 0.145),  # collar
        curve(t, (0.3, 0.07), (0.42, 0.072), (0.56, 0.095), (0.68, 0.14), (0.76, 0.195)),  # flared body
        ellipse(t, 0.775, 0.022, 0.225),  # ring
        curve(t, (0.78, 0.2), (0.86, 0.245)),
        ellipse(t, 0.885, 0.04, 0.285),  # stepped foot
        curve(t, (0.9, 0.28), (1.0, 0.295)),
    ])


def queen_profile(t):
    return np.maximum.reduce([
        ellipse(t, 0.03, 0.03, 0.034),  # the ball on top
        curve(t, (0.05, 0.13), (0.085, 0.112), (0.13, 0.082), (0.165, 0.07)),  # crown, flaring upwards
        ellipse(t, 0.175, 0.016, 0.098),  # crown band
        ellipse(t, 0.205, 0.014, 0.125),  # collar
        ellipse(t, 0.232, 0.01, 0.092),
        curve(t, (0.21, 0.056), (0.36, 0.056), (0.52, 0.066), (0.66, 0.092), (0.76, 0.135)),  # long body
        ellipse(t, 0.775, 0.016, 0.16),  # ring
        curve(t, (0.78, 0.14), (0.86, 0.17)),
        ellipse(t, 0.885, 0.034, 0.205),  # stepped foot
        curve(t, (0.9, 0.2), (1.0, 0.212)),
    ])


def lathe(profile, height, base, crown=None):
    """A turned piece in glazed ceramic, with real reflections: sky above, grass below."""
    rows = (np.arange(height, dtype=np.float32) + 0.5) / height
    r = profile(rows) * height
    r = np.convolve(np.pad(r, 1, mode="edge"), np.ones(3) / 3, mode="valid")
    slope = np.clip(np.gradient(r), -3, 3)
    width = int(r.max() * 2) + 8
    xs = (np.arange(width) + 0.5 - width / 2)[None, :]
    rr = np.maximum(r[:, None], 0.001)
    side = xs / rr
    inside = np.abs(side) <= 1
    side = np.clip(side, -1, 1)
    # Normal of a surface of revolution: radial part, plus up or down by the slope.
    nx, nz = side, np.sqrt(np.clip(1 - side**2, 0, 1))
    ny = np.broadcast_to(-slope[:, None], nx.shape)
    ln = np.sqrt(nx**2 + ny**2 + nz**2)
    nx, ny, nz = nx / ln, ny / ln, nz / ln
    # Reflection of the view ray (ry < 0 looks up at the sky).
    ry, rx = 2 * nz * ny, 2 * nz * nx
    sky_hi, sky_lo, ground = rgb("#F2FAFF"), rgb("#8CCBF2"), rgb("#2A9A52")
    sky = sky_lo[None, None] + (sky_hi - sky_lo)[None, None] * smooth(0.0, 0.8, -ry)[..., None]
    env = ground[None, None] + (sky - ground[None, None]) * smooth(-0.04, 0.06, -ry)[..., None]
    fres = 0.06 + 0.94 * (1 - nz) ** 3.2
    b = rgb(base)
    l = np.array([-0.5, -0.62, 0.6])
    l = l / np.linalg.norm(l)
    diff = np.clip(nx * l[0] + ny * l[1] + nz * l[2], 0, 1)[..., None]
    col = b[None, None] * (0.16 + 1.0 * diff)
    col = col + (env - col) * (fres[..., None] * 0.8 + 0.07)
    # A tall window reflected on the left, and the sharp sun highlight.
    window = smooth(0.3, 0.36, -rx) * (1 - smooth(0.56, 0.62, -rx)) * smooth(-0.3, 0.1, -ry) * (1 - smooth(0.5, 0.9, -ry))
    hv = l + np.array([0, 0, 1.0])
    hv = hv / np.linalg.norm(hv)
    spec = np.clip(nx * hv[0] + ny * hv[1] + nz * hv[2], 0, 1) ** 70
    col = col + spec[..., None] * 0.95 + window[..., None] * 0.3
    alpha = inside * smooth(0.0, 0.03, 1 - np.abs(xs / rr)) * (r[:, None] > 0.5)
    if crown:
        # The queen's crown: cut the rim into points, seen wrapping round the head.
        top, depth, points = crown
        angle = np.arcsin(side)
        rim = top + depth * np.abs(np.cos(angle * points / 2))
        row = rows[:, None]
        cut = smooth(-0.002, 0.002, row - rim)
        alpha = alpha * np.where((row > top - 0.012) & (row < top + depth + 0.002), cut, 1.0)
    out = np.dstack([np.clip(col, 0, 1), alpha])
    return Image.fromarray((out * 255).astype(np.uint8), "RGBA")


def piece(lay, profile, height, x, ybase, base, crown=None):
    img = lathe(profile, height, base, crown)
    lay.alpha_composite(img, (int(x - img.width / 2), int(ybase - height)))


# ---------- Computer ----------------------------------------------------------
def computer(x, y, s):
    """A chunky beige-box computer in lilac. Returns (body, screen) layers."""
    k = 2.0 * s
    size = (int(640 * k), int(620 * k))
    body = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    P = lambda *pts: [(a * k, b * k) for a, b in pts]
    top, front, side = rgb("#DCD3FB"), rgb("#BBAAF4"), rgb("#8872D8")
    # Base unit.
    d.polygon(P((46, 470), (168, 410), (610, 410), (488, 470)), fill=(*u8(top), 255))
    d.polygon(P((488, 470), (610, 410), (610, 490), (488, 560)), fill=(*u8(side), 255))
    d.rounded_rectangle(P((46, 470), (488, 560)), radius=8 * k, fill=(*u8(front), 255))
    d.rounded_rectangle(P((280, 498), (452, 514)), radius=3 * k, fill=(38, 30, 74, 255))
    d.rectangle(P((400, 524), (452, 532)), fill=(*u8(side), 255))
    for i in range(6):
        d.rectangle(P((70 + i * 22, 520), (84 + i * 22, 532)), fill=(*u8(side * 0.92), 255))
    # Monitor.
    d.polygon(P((100, 70), (216, 16), (566, 16), (450, 70)), fill=(*u8(top), 255))
    d.polygon(P((450, 70), (566, 16), (566, 356), (450, 436)), fill=(*u8(side), 255))
    d.rounded_rectangle(P((100, 70), (450, 436)), radius=14 * k, fill=(*u8(front), 255))
    for i in range(7):
        d.line(P((470 + i * 11, 96 - i * 6), (470 + i * 11, 210 - i * 6)), fill=(*u8(side * 0.72), 255), width=max(1, int(3 * k)))
    # Gentle top-to-bottom light across the faces.
    a = np.asarray(body, dtype=np.float32) / 255
    grad = np.linspace(1.08, 0.82, a.shape[0])[:, None, None]
    a = a.copy()
    a[..., :3] = np.clip(a[..., :3] * grad, 0, 1)
    body = Image.fromarray((a * 255).astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(body)
    # Bevel around the screen, and the three lights.
    d.rounded_rectangle(P((122, 92), (428, 372)), radius=12 * k, fill=(*u8(side * 0.62), 255))
    for i, c in enumerate(["#FF5D5D", "#FFD23F", "#4DA3FF"]):
        ex, ey = 136 + i * 50, 390
        d.ellipse(P((ex, ey), (ex + 32, ey + 32)), fill=(26, 20, 52, 255))
        d.ellipse(P((ex + 5, ey + 5), (ex + 27, ey + 27)), fill=(*u8(rgb(c)), 255))
        d.ellipse(P((ex + 9, ey + 8), (ex + 17, ey + 15)), fill=(255, 255, 255, 170))
    # The screen stays bright at night, so it's its own layer.
    sw, sh = int(274 * k), int(248 * k)
    ys, xs = np.mgrid[0:sh, 0:sw].astype(np.float32)
    u, v = xs / sw * 2 - 1, ys / sh * 2 - 1
    vignette = 1 - 0.55 * np.clip(u**2 + v**2, 0, 1.6) / 1.6
    scan = 0.86 + 0.14 * (np.floor(ys / max(2, 5 * k)) % 2)
    bg = rgb("#04281D")[None, None] * 1.0 + rgb("#0E7A55")[None, None] * (vignette * scan * 0.55)[..., None]
    scr = Image.fromarray((np.clip(bg, 0, 1) * 255).astype(np.uint8)).convert("RGBA")
    g = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    px = 22 * k
    cx0, cy0 = sw / 2, sh / 2
    glow = (92, 240, 180, 255)
    for (cx, cy) in [(-1, -3), (0, -3), (-1, -2), (0, -2), (-1, 1), (0, 1), (-1, 2), (0, 2)]:
        gd.rectangle((cx0 + cx * px, cy0 + cy * px, cx0 + (cx + 1) * px - 2, cy0 + (cy + 1) * px - 2), fill=glow)
    for cx in range(-4, 4):
        gd.rectangle((cx0 + cx * px, cy0 - px * 0.5, cx0 + (cx + 1) * px - 2, cy0 + px * 0.5 - 2), fill=glow)
    scr.alpha_composite(g.filter(ImageFilter.GaussianBlur(5 * k)))
    scr.alpha_composite(g)
    # Curved glass: a soft diagonal reflection.
    refl = np.clip(1 - np.abs(u * 0.7 + v + 0.6) / 0.22, 0, 1) * 0.16
    rl = np.dstack([np.ones_like(u), np.ones_like(u), np.ones_like(u), refl])
    scr.alpha_composite(Image.fromarray((rl * 255).astype(np.uint8), "RGBA"))
    m = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, sw - 1, sh - 1), radius=int(18 * k), fill=255)
    scr.putalpha(m)
    body_l, screen_l = layer(), layer()
    paste_clip(body_l, body, int(x), int(y))
    paste_clip(screen_l, scr, int(x + 138 * k), int(y + 108 * k))
    return body_l, screen_l


# ---------- Meadow -----------------------------------------------------------
def grade(img, night):
    """Night: moonlit greens and blues, the same layout."""
    if not night:
        return img
    a = np.asarray(img, dtype=np.float32) / 255
    a = a.copy()
    c = a[..., :3]
    # Darker and bluer, but the flowers keep their colours.
    a[..., :3] = np.clip((c**1.25) * np.array([0.58, 0.68, 0.8]), 0, 1)
    return Image.fromarray((a * 255).astype(np.uint8), "RGBA")


def meadow(night, props_computer=True):
    rng = np.random.default_rng(1705)
    patch = patch_noise(rng)
    out = layer()
    add = lambda img: out.alpha_composite(grade(img, night))
    # Solid ground under the roots, so the bottom edge has no gaps.
    ground = layer()
    ImageDraw.Draw(ground).rectangle((0, H - 34, W, H), fill=(*u8(rgb("#0D4023")), 255))
    add(ground)
    back = dict(dark="#0F4426", mid="#2E8A3F", tip="#79BC4E")
    add(grass(rng, 2300, H - 70, H - 10, 210, 4.6, patch=patch, blur=1.1, **back))
    # Flowers in the back row, soft.
    far = layer()
    for x, kind, size in [(120, "white", 32), (420, "yellow", 30), (760, "purple", 30), (1010, "white", 28), (1880, "yellow", 30), (2060, "white", 30), (2170, "purple", 30)]:
        stem_flower(far, rng, x, H, H - rng.uniform(210, 270), size, kind)
    add(far.filter(ImageFilter.GaussianBlur(0.9)))
    add(grass(rng, 1900, H - 40, H, 170, 5.4, patch=patch, dark="#0C3D22", mid="#2F9346", tip="#8ACB56"))
    # The computer and chess pieces stand in the grass.
    if props_computer:
        body, screen = computer(1190, 38, 0.56)
        add(body)
        out.alpha_composite(screen)
    props = layer()
    piece(props, queen_profile, 410, 885, 420, "#0B9468", crown=(0.052, 0.042, 8))
    piece(props, pawn_profile, 250, 1072, 418, "#10A673")
    piece(props, pawn_profile, 215, 330, 416, "#0B9468")
    piece(props, pawn_profile, 235, 2015, 418, "#0B9468")
    add(props)
    add(grass(rng, 1400, H - 22, H, 88, 5.8, patch=patch, dark="#0B3A20", mid="#2C8F42", tip="#9AD65C", dry=0.05))
    # The main row of flowers, sharp, spread so any crop has some.
    near = layer()
    row = [(40, "orange", 54, 175), (210, "yellow", 62, 210), (500, "coral", 46, 150), (640, "white", 44, 205), (820, "orange", 58, 165), (1000, "yellow", 42, 125), (1150, "purple", 50, 120), (1860, "orange", 62, 185), (1960, "white", 42, 120), (2120, "purple", 56, 200)]
    for x, kind, size, h in row:
        stem_flower(near, rng, x, H, H - h, size, kind)
    add(near)
    add(grass(rng, 900, H - 6, H + 16, 62, 6.4, patch=patch, dark="#0A331C", mid="#2A8A3F", tip="#A5DD62", dry=0.06))
    return out


# ---------- The scene at the top of pages --------------------------------------
SCENES = {
    "day": dict(top="#0C3FB0", mid="#1E62D2", low="#A8DCF0", cloud="#FFFFFF", cloud_dark="#A9C8E8", a="#00A35F", b="#F4FCF6", haze="#CDEFE2", tree_a="#0E5A33", tree_b="#2F9A4F"),
    "night": dict(top="#020612", mid="#061A1E", low="#0E5240", cloud="#17574A", cloud_dark="#06191A", a="#03160F", b="#17A873", haze="#0A3A2C", tree_a="#020B08", tree_b="#0A3123"),
}


def soft_noise(w, h, rng, stretch=2.2, beta=1.75):
    """Fractal noise made in frequency space: smooth, natural, no blocks or grid marks."""
    fx = np.fft.rfftfreq(w)[None, :] * w * (1 / stretch)
    fy = np.fft.fftfreq(h)[:, None] * h
    f = np.sqrt(fx**2 + fy**2)
    f[0, 0] = 1
    spectrum = np.fft.rfft2(rng.standard_normal((h, w))) / f**beta
    spectrum[0, 0] = 0
    n = np.fft.irfft2(spectrum, s=(h, w)).astype(np.float32)
    return 0.5 + n / (n.std() + 1e-6) * 0.17


def sky(c, rng, w, h, night):
    y = np.linspace(0, 1, h)[:, None, None]
    top, mid, low = rgb(c["top"]), rgb(c["mid"]), rgb(c["low"])
    grad = np.where(y < 0.86, top + (mid - top) * (y / 0.86), mid + (low - mid) * ((y - 0.86) / 0.14))
    grad = np.broadcast_to(grad, (h, w, 3)).copy()
    if night:
        # A moon and its glow, on the right where no text sits.
        ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.sqrt((xs - w * 0.74) ** 2 + (ys - h * 0.13) ** 2)  # clear of the title's second line
        grad += (np.exp(-((d / 210) ** 2)) * 0.24)[..., None] * rgb("#8FE8C8")
        grad = grad + (rgb("#EAFBF2") - grad) * (smooth(0, 1.5, 62 - d) * (1 - 0.08 * soft_noise(w, h, rng)))[..., None]
        stars = (rng.random((h, w)) > 0.9988) * (d > 90) * (1 - np.linspace(0, 1, h))[:, None]
        grad += stars[..., None] * 0.85
    # Clouds stay low, so the upper sky is clear for the title.
    n = soft_noise(w, h, rng)
    rows = np.linspace(0, 1, h)[:, None]
    n2 = n + (smooth(0.6, 0.98, rows) - 0.72) * 0.5
    density = smooth(0.575, 0.615, n2)  # a few low clouds, never a streak across the sky
    above = np.vstack([n2[:14], n2[:-14]])
    lit = np.clip((n2 - above) * 7 + 0.7, 0, 1)
    color = rgb(c["cloud_dark"])[None, None] + (rgb(c["cloud"]) - rgb(c["cloud_dark"]))[None, None] * lit[..., None]
    return grad + (color - grad) * density[..., None]


def board(c, w, h):
    k = 2
    bw, bh = w * k, h * k
    ys, xs = np.mgrid[0:bh, 0:bw].astype(np.float32)
    depth = (ys + 12) / bh
    z = 1 / depth
    u, v = (xs - bw * 0.5) / bw * z * 3.3, z * 1.5
    a = math.radians(14)
    uu, vv = u * math.cos(a) - v * math.sin(a), u * math.sin(a) + v * math.cos(a)
    check = (np.floor(uu * 3.0) + np.floor(vv * 3.0)) % 2
    col = rgb(c["a"])[None, None] + (rgb(c["b"]) - rgb(c["a"]))[None, None] * check[..., None]
    col = rgb(c["haze"])[None, None] + (col - rgb(c["haze"])[None, None]) * smooth(0.04, 0.26, depth)[..., None]
    # A glossy floor: it brightens towards the viewer's feet.
    col = np.clip(col * (0.92 + 0.12 * depth[..., None]), 0, 1)
    return Image.fromarray((col * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)


def tree_line(c, rng, w, h):
    n = soft_noise(w, h, rng)
    fine = soft_noise(w, h, rng)
    ys = np.arange(h)[:, None] / h
    xs = np.linspace(-1, 1, w)[None, :]
    edge = 1 - (0.05 + 0.3 * np.abs(xs) ** 2.6) + (n - 0.5) * 0.22
    mask = smooth(0, 0.05, ys - edge) * 0.88
    a, b = rgb(c["tree_a"]), rgb(c["tree_b"])
    col = a[None, None] + (b - a)[None, None] * smooth(0.36, 0.66, fine)[..., None]
    return np.dstack([col, mask])


def floor_piece(canvas, grade_fn, profile, height, x, ybase, base, crown=None):
    """A piece standing on the glossy board: shadow, reflection, then the piece."""
    img = lathe(profile, height, base, crown)
    sw, sh = int(img.width * 2.0), int(img.width * 0.42)
    shadow = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(shadow).ellipse((sw * 0.04, sh * 0.12, sw * 0.96, sh * 0.88), fill=120)
    shadow = shadow.filter(ImageFilter.GaussianBlur(sh * 0.15))
    canvas.paste((0, 0, 0), (int(x - sw * 0.36), int(ybase - sh * 0.56)), shadow)
    flip = img.transpose(Image.FLIP_TOP_BOTTOM)
    a = np.asarray(flip, dtype=np.float32).copy()
    fade = np.clip(0.3 - np.linspace(0, 0.75, a.shape[0]), 0, 1)[:, None]
    a[..., 3] = a[..., 3] * fade
    refl = Image.fromarray(a.astype(np.uint8), "RGBA")
    canvas.paste(grade_fn(refl), (int(x - img.width / 2), int(ybase - 2)), refl)
    g = grade_fn(img)
    canvas.paste(g, (int(x - img.width / 2), int(ybase - height)), g)


def scene(name):
    global W, H
    saved = W, H
    W, H = 1800, 1100
    night = name == "night"
    c = SCENES[name]
    rng = np.random.default_rng(417)
    patch = patch_noise(rng)
    h0 = 680  # the horizon: everything above is sky
    arr = np.zeros((H, W, 3), dtype=np.float32)
    arr[:h0] = sky(c, rng, W, h0, night)
    trees = tree_line(c, rng, W, h0)
    arr[:h0] = arr[:h0] + (trees[..., :3] - arr[:h0]) * trees[..., 3:]
    canvas = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).convert("RGBA")
    canvas.paste(board(c, W, H - h0), (0, h0))
    add = lambda img: canvas.alpha_composite(grade(img, night))
    gr = grade if night else (lambda i, _n: i)
    add(grass(rng, 1500, h0 - 2, h0 + 12, 58, 3.0, patch=patch, blur=0.6, dark="#0F4426", mid="#2E8A3F", tip="#79BC4E"))
    # Computer on the right, its screen unaffected by night.
    body, screen = computer(1180, 420, 0.42)
    shade = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shade).ellipse((1150, 835, 1760, 915), fill=165)
    canvas.paste((0, 0, 0), (0, 0), shade.filter(ImageFilter.GaussianBlur(16)))
    add(body)
    canvas.alpha_composite(screen)
    add(grass(rng, 260, 860, 880, 66, 3.6, patch=patch, xspan=(1150, 1700), dark="#0F4A28", mid="#2F9346", tip="#8ACB56"))
    floor_piece(canvas, lambda i: gr(i, night), pawn_profile, 210, 1010, 830, "#0FA874")
    floor_piece(canvas, lambda i: gr(i, night), queen_profile, 350, 770, 935, "#10A673", crown=(0.052, 0.042, 8))
    floor_piece(canvas, lambda i: gr(i, night), pawn_profile, 170, 470, 800, "#0B9468")
    # Foreground at the sides; the middle of the board stays clear.
    add(grass(rng, 1050, 1000, 1110, 215, 6.0, patch=patch, xspan=(-30, 500), dark="#0B3A20", mid="#2C8F42", tip="#9AD65C"))
    add(grass(rng, 1050, 1000, 1110, 215, 6.0, patch=patch, xspan=(1320, W + 30), dark="#0B3A20", mid="#2C8F42", tip="#9AD65C"))
    add(grass(rng, 500, 1070, 1115, 100, 5.0, patch=patch, dark="#0B3A20", mid="#2C8F42", tip="#9AD65C"))
    near = layer()
    for x, kind, size, h in [(70, "purple", 62, 190), (210, "orange", 76, 260), (360, "yellow", 62, 170), (455, "white", 44, 290), (1345, "white", 46, 190), (1450, "orange", 66, 180), (1590, "yellow", 78, 270), (1730, "purple", 62, 195)]:
        stem_flower(near, rng, x, H, H - h, size, kind)
    add(near)
    add(grass(rng, 420, H - 8, H + 16, 74, 6.0, patch=patch, dark="#0A331C", mid="#2A8A3F", tip="#A5DD62"))
    W, H = saved
    return canvas.convert("RGB")


def cloud_sky(w=1200, h=630):
    """The share card's background: a pale sky full of soft white clouds."""
    rng = np.random.default_rng(23)
    y = np.linspace(0, 1, h)[:, None, None]
    grad = np.broadcast_to(rgb("#74BCF0") + (rgb("#CDEBF8") - rgb("#74BCF0")) * y, (h, w, 3)).copy()
    n = soft_noise(w, h, rng, stretch=2.6, beta=1.9)
    density = smooth(0.44, 0.56, n)
    above = np.vstack([n[:10], n[:-10]])
    lit = np.clip((n - above) * 8 + 0.78, 0, 1)
    color = rgb("#BCDDF3")[None, None] + (rgb("#FFFFFF") - rgb("#BCDDF3"))[None, None] * lit[..., None]
    out = grad + (color - grad) * density[..., None]
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


def write_webp(img, path, q):
    if shutil.which("cwebp"):
        with tempfile.NamedTemporaryFile(suffix=".png") as f:
            img.save(f.name)
            subprocess.run(["cwebp", "-quiet", "-q", str(q), "-alpha_q", "70", "-m", "6", f.name, "-o", path], check=True)
    else:
        img.save(path, "WEBP", quality=q, method=6)


# ---------- Icons --------------------------------------------------------------
def logo(px, rounded=True):
    k = 8  # drawn big, then scaled down
    u = px * k / 16
    img = Image.new("RGBA", (px * k, px * k), (0, 179, 104, 255))
    d = ImageDraw.Draw(img)
    white, dark = (255, 255, 255, 255), (4, 38, 26, 255)
    for x, y, w, h in [(7, 2, 2, 2), (3, 5, 10, 2), (7, 8, 2, 2)]:
        d.rectangle((x * u, y * u, (x + w) * u - 1, (y + h) * u - 1), fill=dark)
    for row in range(2):
        for col in range(8):
            d.rectangle((col * 2 * u, (12 + row * 2) * u, (col * 2 + 2) * u - 1, (14 + row * 2) * u - 1), fill=dark if (col + row) % 2 else white)
    if rounded:
        mask = Image.new("L", img.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=3.5 * u, fill=255)
        img.putalpha(mask)
    return img.resize((px, px), Image.BOX)


def make_icons(root):
    logo(192).save(os.path.join(root, "src/app/icon.png"))
    # iOS rounds the corners itself.
    logo(180, rounded=False).convert("RGB").save(os.path.join(root, "src/app/apple-icon.png"))
    logo(256).save(os.path.join(root, "docs/logo.png"))
    # Each size is drawn on its own, so 16px stays crisp.
    frames = [logo(n) for n in (64, 48, 32, 16)]
    frames[0].save(os.path.join(root, "src/app/favicon.ico"), format="ICO", append_images=frames[1:], sizes=[(n, n) for n in (64, 48, 32, 16)])


def main():
    root = os.path.join(os.path.dirname(__file__), "..")
    make_icons(root)
    os.makedirs(os.path.join(root, "public/meadow"), exist_ok=True)
    os.makedirs(os.path.join(root, "public/scene"), exist_ok=True)
    os.makedirs(os.path.join(root, "assets/og"), exist_ok=True)
    cloud_sky().save(os.path.join(root, "assets/og/clouds.jpg"), quality=78, optimize=True)
    for name in SCENES:
        img = scene(name)
        write_webp(img, os.path.join(root, f"public/scene/{name}-1800.webp"), 62)
        write_webp(img.resize((1000, 611), Image.LANCZOS), os.path.join(root, f"public/scene/{name}-1000.webp"), 62)
    for name in ("day", "night"):
        img = meadow(name == "night")
        small = img.resize((1300, int(H * 1300 / W)), Image.LANCZOS)
        write_webp(small, os.path.join(root, f"public/meadow/{name}.webp"), 58)
        if name == "day":
            # The share card (its renderer reads PNG, not WebP), kept small with a palette.
            # No computer here: it would stick out from behind the receipt.
            og = meadow(False, props_computer=False).crop((200, 0, 1800, H)).resize((1200, int(H * 1200 / 1600)), Image.LANCZOS)
            og.quantize(colors=200, method=Image.FASTOCTREE, dither=Image.NONE).save(os.path.join(root, "assets/og/meadow.png"), optimize=True)


if __name__ == "__main__":
    main()
