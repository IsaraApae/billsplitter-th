# Bill Splitter

Mobile-first bill splitter with a "Liquid Glass" UI: scan a receipt (Thai/English), split it equally or by item, add discount / service charge / VAT, share one link, and track who has paid — with PromptPay QR codes and saved friends.

Next.js (App Router) · TypeScript · Tailwind v4 · Upstash Redis · Vercel Blob · Gemini Flash (receipt scanning) · Tesseract.js fallback.

## Scripts

```bash
npm install
npm run dev              # http://localhost:3000  (add `-- -H 0.0.0.0` to open it from a phone on the same Wi-Fi)
npm test                 # Vitest: money maths, scan clean-up, OCR filter, EXIF, PromptPay, friends
npm run build
npm run diagnose:ocr     # runs photos in test-receipts/ through the old vs new on-device OCR pipeline
```

Without Redis/Blob env vars, `npm run dev` uses in-memory stores so sharing and QR uploads work locally (lost on restart). Production requires them.

## Environment variables

| Name | Where it comes from | Required |
| --- | --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Added automatically when you connect **Upstash for Redis** (Vercel Marketplace) | yes |
| `BLOB_READ_WRITE_TOKEN` | Added automatically when you connect a **Vercel Blob** store (public access) | for uploaded PromptPay QR images |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey — server-only | no — without it scanning falls back to on-device OCR |
| `GEMINI_MODEL` | Override the model (default `gemini-3.8-flash`) | no |
| `NEXT_PUBLIC_SITE_URL` | Absolute URL for Open Graph images with a custom domain | no |

`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are also accepted instead of the `KV_*` names.

## How it works

- **Maths** — `src/lib/calc.ts`, pure and integer-only (satang/cents). Items → discount → service charge on the discounted subtotal → VAT on (subtotal + service). Largest-remainder allocation, so person totals always sum exactly to the grand total.
- **Scanning** — the client fixes EXIF rotation and uploads a ~2048px JPEG to `POST /api/scan` (Gemini Flash, temperature 0, strict JSON schema, "copy exactly, never translate or guess"). The response says which engine ran; failures log `{"evt":"scan","reason":…}` and the UI badge shows "Scanned with Gemini" / "Scanned offline". On any failure the browser runs Tesseract (eng+tha) on the receipt only (paper auto-crop, shadow flattening), keeps confident, well-formed words on lines ending in a price, and every result passes the same clean-up (`src/lib/scanFilter.ts`) that drops totals/tax/service/payment/change lines and price-less lines.
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
