# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Thai university students and friend groups (confirmed: friends and classmates, not the general public). They split food and drinks on their phones, usually at or just after a restaurant or bar, often in the evening. One person paid and wants the money back; the others open a link from LINE or Messenger and need to see what they owe and pay it.

## Product Purpose

Split a restaurant bill with friends in Thailand: scan the receipt, tick who had what, share one link, and see who has paid. Success is everyone paying the organiser the right amount without the organiser having to chase or do arithmetic.

## Positioning

Built around how Thai friends actually settle up: Gemini reads Thai or English receipts, each person gets a PromptPay QR for their exact amount, and transfer slips are checked and ticked automatically. A friend needs no account or app, only the link.

## Operating Context

Phone first, one-handed, in restaurants and bars, on mobile data, often inside the LINE or Messenger in-app browser. The share link's preview card in chat is a friend's first contact with the product. Amounts must be readable at a table at night.

## Capabilities and Constraints

- Create a split: scan or add items, choose people, discount / service / VAT / rounding, review, share.
- Shared bill page, big bills (several bills from one outing), "What I owe", "Owed to you", shareable "who still owes" list, History, Friends, Me (profile, PromptPay, backup, appearance).
- No accounts: drafts, friends, edit tokens and history live in the phone's localStorage. Those screens render on the client only.
- Next.js 16 on Vercel, Redis, Vercel Blob, Gemini over REST.
- Light and dark appearance, with an Auto / Light / Dark picker on the Me page.
- Interface copy is English; names, bill titles and receipt items are often Thai.

## Brand Commitments

- Name: Bill Splitter.
- Green is the brand colour (`#00B368`, chosen by the user; darker `#00875A` for text on white, dark text on the green). Red is only for negative amounts and errors.
- Visual reference chosen by the user: the ICE17 x AI05 "Byenior" Instagram campaign (@iceyingyhai). Use its visual language with original artwork; never reuse that campaign's images.

## Evidence on Hand

No testimonials, user counts or benchmarks exist; do not invent any. Measured: mobile Lighthouse 97 before the redesign, median receipt scan 3.3 s (see `docs/scan-reliability.md`).

## Product Principles

- Money is always legible: amounts and names beat decoration on every screen where someone is working.
- A friend opening the link should know what they owe and how to pay within seconds, with no account.
- Nothing changes silently: anything inferred from a receipt or slip is shown and can be corrected.
- It should feel like it belongs to the friend group, not to a bank.
