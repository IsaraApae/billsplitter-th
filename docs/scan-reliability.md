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

## After

_(filled in after Phase 2)_
