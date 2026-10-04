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
