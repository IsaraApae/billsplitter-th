# Bill Splitter

Mobile-first bill splitter: scan a receipt (Thai/English), split it equally or by item, add discount / service charge / VAT, share one link, and track who has paid.

Next.js (App Router) · TypeScript · Tailwind · Upstash Redis · Gemini Flash (receipt scanning) · Tesseract.js fallback.

## Scripts

```bash
npm install
npm run dev        # http://localhost:3000  (add `-- -H 0.0.0.0` to open it from a phone on the same Wi-Fi)
npm test           # Vitest: money maths, PromptPay, OCR parser
npm run build
```

Without Redis env vars, `npm run dev` uses an in-memory store so sharing works locally (data is lost on restart). Production requires Redis.

## Environment variables

| Name | Where it comes from | Required |
| --- | --- | --- |
| `KV_REST_API_URL` | Added automatically when you connect **Upstash for Redis** from the Vercel Marketplace | yes (prod) |
| `KV_REST_API_TOKEN` | Same as above | yes (prod) |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey (server-only, never sent to the browser) | no — without it scanning falls back to on-device OCR |
| `GEMINI_MODEL` | Override the model (default `gemini-3.8-flash`) | no |
| `NEXT_PUBLIC_SITE_URL` | Absolute URL for Open Graph images if you use a custom domain | no |

`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are also accepted instead of the `KV_*` names.

## How it works

- `src/lib/calc.ts` — all bill maths, pure and integer-only (satang/cents). Items → discount → service charge on the discounted subtotal → VAT on (subtotal + service). Every division uses a largest-remainder allocation, so person totals always sum exactly to the grand total. Tests in `src/lib/calc.test.ts`.
- `POST /api/scan` — image → Gemini structured JSON; on 429/any failure the client runs Tesseract (eng+tha) in the browser.
- `POST /api/splits` → `{ id, token }`. The split is stored at `split:{id}` (90-day TTL, refreshed on activity). Only a SHA-256 of the edit token is stored; the token itself lives in the creator's localStorage.
- `PUT /api/splits/{id}` requires `x-edit-token`. `GET|POST /api/splits/{id}/paid` reads/sets paid ticks (a Redis hash).
- All API routes are validated with zod and rate limited per IP (`@upstash/ratelimit`).

## Deploy / redeploy

```bash
npx vercel --prod
```
