# Scan reliability

Measured with `node scripts/scan-reliability.mts` against production
(https://billsplitter-th.vercel.app), one Yoshinoya receipt (2048px JPEG, 563 KB),
10 sequential requests, 5 s apart.

## Before (2026-10-04, models: gemini-3.8-flash → retry → gemini-3.7-flash)

| Run | Success | Median (successes) | Median (all) | Failures |
|---|---|---|---|---|
| 1 | 5/10 | 9.3 s | 8.3 s | busy ×5 |
| 2 | 3/10 | 5.4 s | 8.2 s | busy ×7 |

Raw Gemini errors behind "busy" (Vercel logs):

- `503 UNAVAILABLE` "This model is currently experiencing high demand" — on both
  gemini-3.8-flash and gemini-3.7-flash.
- `429 RESOURCE_EXHAUSTED` on gemini-3.8-flash — mostly the free tier's
  **per-day, per-model** request quota (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`,
  retryDelay ≈ 9 h), once the per-minute quota (retryDelay 14 s).
- The API reports the *last* attempt's reason, so a 429 on the primary model
  followed by a 503 on the fallback shows up as "busy".

## After (2026-10-04, Phase 2)

Chain `gemini-3.8-flash → gemini-3.7-flash → gemini-3.5-flash-lite`, 500/503 retried once
with 1–2 s jitter, 429/timeout move on, ~20 s per attempt, ~55 s total.

| Run | Success | Median (successes) | Answered by | Notes |
|---|---|---|---|---|
| 1 — model chain only | **10/10** | 21.7 s | 3.5-flash-lite ×9, 3.7-flash ×1 | 3.8 out of daily quota (429, fast); 3.7 often hung until the 20 s timeout |
| 2 — + model cooldowns | **10/10** | **4.1 s** | 3.5-flash-lite ×10 | 3.8/3.7 skipped while cooling down; one attempt per scan after the first |

Every result: 10 items, ฿1,500 subtotal, ฿225 discount, VAT included, ฿1,275 total, THB.

Cooldowns (shared via Redis): a model out of quota is tried last until Google's
`retryDelay` (capped at 6 h); a timeout or a repeated 503 sends it to the back for 2 min.
When 3.8's daily quota resets, it automatically becomes first again.

## Latest (2026-10-07): six models, raced

Chain `gemini-3.8-flash → 3.7-flash → 3.6-flash → 3.5-flash → 3.5-flash-lite → 3.1-flash-lite`
(code in `src/lib/server/gemini.ts`). The two best available models start together; a
third starts after 4 s if neither has answered, and any failure (busy, quota, timeout)
starts the next one at once. The first good answer wins and the rest are cancelled
(at most 3 at a time). 15 s per call, ~55 s overall. Busy models cool down for 60 s,
timeouts for 2 min, quota until Google's `retryDelay`, unknown model names for a day.

Same receipt, app-sized (2048 px, 564 KB), 10 requests 5 s apart:

| Success | Median | Answered by |
|---|---|---|
| **10/10** | **7.3 s** (4.3–18.3 s) | 3.5-flash ×6, 3.6-flash ×1, 3.7-flash ×1, 3.1-flash-lite ×2 |

Every result: 10 items, ฿1,500 subtotal. The slow ones (12–18 s) had several models busy
(503) or out of quota at once on the free tier; with a paid key the top models are
answered first and faster.
