# Bill Splitter

Mobile-first bill splitter with a "Liquid Glass" UI: scan a receipt (Thai/English), split it equally or by item, add discount / service charge / VAT, share one link, and track who has paid — with PromptPay QR codes and saved friends.

Next.js (App Router) · TypeScript · Tailwind v4 · Upstash Redis · Vercel Blob · Gemini (receipt scanning).

## Scripts

```bash
npm install
npm run dev              # http://localhost:3000  (add `-- -H 0.0.0.0` to open it from a phone on the same Wi-Fi)
npm test                 # Vitest: money maths, scan clean-up, EXIF, PromptPay, friends
npm run build
node scripts/scan-reliability.mts   # sends a receipt to /api/scan 10× and reports success rate + median time
```

Without Redis/Blob env vars, `npm run dev` uses in-memory stores so sharing and QR uploads work locally (lost on restart). Production requires them.

## Environment variables

| Name | Where it comes from | Required |
| --- | --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Added automatically when you connect **Upstash for Redis** (Vercel Marketplace) | yes |
| `BLOB_READ_WRITE_TOKEN` | Added automatically when you connect a **Vercel Blob** store (public access) | for uploaded PromptPay QR images |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey — server-only | yes for scanning — without it the app asks for items by hand |
| `GEMINI_MODELS` | Comma-separated models to try in order (default `gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash-lite`) | no |
| `NEXT_PUBLIC_SITE_URL` | Absolute URL for Open Graph images with a custom domain | no |

`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are also accepted instead of the `KV_*` names.

## How it works

- **Maths** — `src/lib/calc.ts`, pure and integer-only (satang/cents). Items → discount → service charge on the discounted subtotal → VAT on (subtotal + service). Largest-remainder allocation, so person totals always sum exactly to the grand total.
- **Scanning** — the client fixes EXIF rotation and POSTs a ~2048px JPEG (quality 0.85) as FormData `image` to `POST /api/scan`. The route tries Gemini models in order (`GEMINI_MODELS`, default `gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash-lite`): a 500/503 gets one retry on the same model after 1–2 s with jitter; a 429 or timeout moves to the next model; a 400 stops. ~20 s per attempt, ~55 s in total (`maxDuration` 60; the client gives up at 62 s). Temperature 0, lowest thinking level, strict JSON schema matching `applyScan`. The response includes `model` and `attempts`; every attempt is logged with Google's raw status. If all attempts fail, the app shows the reason with **Try again** and **Add by hand** (no offline OCR). Scanned items go through `src/lib/scanFilter.ts` (drops price-less lines and lines whose whole name is a summary keyword; keeps negative per-item discounts), and the Items step warns when items − discount + service + VAT don't match the printed total (±1 unit). `node scripts/scan-reliability.mts` measures success rate and timing.
- **Sharing** — `POST /api/splits` → `{ id, token }` stored at `split:{id}` (90-day TTL, refreshed on activity). Only a SHA-256 of the edit token is stored. `GET|POST /api/splits/{id}/paid` for paid ticks.
- **PromptPay** — "Me" page: upload your bank's QR (compressed, stored in Vercel Blob via `POST /api/qr`, owned by a device token) or generate one from your PromptPay number (`promptpay-qr` + `qrcode`, amount included per person). Shared splits always show your *current* uploaded QR via `GET /api/qr/{owner}`.
- **Friends** — saved on the device (`localStorage`): friends (name, emoji, colour), groups, and the last crew for "Same as last time".
- All API routes are validated (zod) and rate limited per IP (`@upstash/ratelimit`).

## Deploy / redeploy

The code lives in a private GitHub repo (`IsaraApae/billsplitter-th`) connected to the Vercel project:

- Push to `main` → production deploy (https://billsplitter-th.vercel.app).
- Push any other branch → preview deploy with its own URL.

Manual deploy (still works): `npx vercel deploy --prod`.
Live check after a deploy: `node scripts/smoke-prod.mts https://billsplitter-th.vercel.app [receipt.jpg]`.
