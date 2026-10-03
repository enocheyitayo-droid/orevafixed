# Latest verification

42 automated tests passed for the current owner release. Four-click logo navigation and first-time owner setup page were checked in the browser. Vercel's persistent-backend proxy is not yet configured or tested.

# Verification report

Executed locally on 27 September 2026 with Node.js 24.13.0 and SQLite. **26 automated tests passed; 0 failed.** The runner uses isolated databases and mocked Paystack responses, not real money.

## Automated coverage

| Area | Verified behaviour |
| --- | --- |
| Successful payment | One paid order, one receipt, stock deducted once, outbox created atomically |
| Failed / abandoned / ongoing | No receipt or false success; failed/abandoned release reservations |
| Duplicate webhook | Two signed HTTP deliveries trigger server verification but only one allocation/outbox |
| Authenticity | Forged/missing/modified HMAC signatures rejected |
| Payment details | Wrong reference, amount, currency, order metadata, customer email or live domain rejected |
| Timeout | Provider timeout leaves order unpaid and available for reconciliation |
| Concurrent last item | Two worker threads, independent SQLite connections: exactly one successful reservation |
| Expiry | Expired checkout cannot start payment; reservations release by timestamp |
| Late payment | Reacquires available stock or records paid / On hold when stock was resold |
| Input validation | Invalid quantities, hidden stock and unavailable quantities rejected |
| Idempotent checkout | Same request returns original order; changed details with same key rejected |
| Delivery | Server-configured fee/timeframe; client-supplied totals ignored |
| Custom order | Requires physical-stock confirmation; same verification, receipt and notifications |
| Fulfilment | Only eligible paid orders; stages cannot be skipped; payment remains distinct |
| Cancellation | Does not falsely refund or automatically restock; confirmed restock only once |
| Refunds | Requires processed provider status, correct transaction/currency/amount; duplicate harmless |
| Notification failures | Payment stays paid; failure and attempts recorded; retry works |
| Development outbox | Clearly marked as not sent |
| Admin security | Session, origin and CSRF checks; HttpOnly cookie; private cost not in public catalogue |
| Upload security | SVG/executable content rejected; valid raster decoded and re-encoded as WebP |
| Production guards | Live keys/development payment configuration rejected; simulation API unavailable |
| Persistence | Order and stock reservation survive reopening SQLite |

Command: `npm test`. Total final test run: approximately 2.3 seconds. SQLite emits Node's experimental-module notice; it is not a test failure.

## Browser checks

Using the local app in the Codex browser:

- Homepage loads successfully; the earlier “Opening the shop…” screen is resolved.
- Supplied Orẽva logo renders and all illustrated sample images load.
- Category filtering, product detail, option selection, add-to-bag, cart total and guest checkout were exercised.
- A clearly labelled development purchase completed through the payment adapter to a paid status page and itemised printable receipt; the cart cleared only after verified payment.
- The server-generated final order summary showed total and timeframe before payment.
- Owner sign-in, product creation, variant price/cost/quantity, custom order with paid delivery, secure link creation, settings save, expense reporting, notification setup guidance and sign-out were exercised on a separate in-memory QA database.
- Phone viewports **390 × 844** and **320 × 740**, plus desktop **1440 × 1000**, checked. No document-level horizontal overflow in the inspected shop/admin views. Dashboard tabs scroll inside their own row on small phones.
- Basic accessibility: labelled controls, semantic headings/navigation, alternative image text, skip link, visible focus styles, status/error announcements, modal focus containment and reduced-motion CSS. Browser console reported no errors during the exercised flows. This was a basic check, not a formal WCAG audit or device/screen-reader certification.

The persistent development database contains one clearly labelled browser-test purchase of a sample item. Use a clean database for deployment. Temporary QA admin credentials existed only in an in-memory server, which was stopped after testing; they are not a login for the delivered store.

## Dependency checks

`sharp` was upgraded to **0.35.4** after an audit identified issues in the initial version. The completed installation audit reported **0 known vulnerabilities**. `web-push` is pinned at **3.6.7** and the lockfile is included. The WebP encoder and authenticated upload route both executed successfully.

## Not exercised with external services

- Real Paystack test checkout/webhook delivery/refund responses: test credentials and a configured HTTPS webhook are needed.
- Actual email delivery: Resend credentials and a verified sending domain are needed.
- Device Web Push delivery: VAPID configuration, HTTPS and owner permission on a supported device are needed.
- Opening a business WhatsApp conversation: the real business number is not yet configured; no message was sent.
- Docker build/public hosting, backup restore on the target host and load testing: deployment remains unperformed.

These are explicit launch checks, not simulated claims of production readiness. Live payments are intentionally blocked and the site has not been published publicly.

## Final design refinement

The reference-inspired design adds an AI-generated decorative brown material texture, white catalogue layout and editorial feature strip. After this change, search and layouts at 320, 390 and 1440 pixels were checked again with no document overflow or browser console errors. The final navigation band is solid black; Shop, Request an item and Bag are computed white, with a white count/black numeral. The original supplied logo asset, positioning and header dimensions were retained.
