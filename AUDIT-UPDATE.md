# Orẽva audit update — 4 October 2026

Prepared on fix/store-audit in work/site-audit. Not deployed by this update.

Changes:
- Explicit Vercel order API routing and JSON fallback, using api/order.js with public-order.mjs and order-actions.mjs. Removes the old nested API handlers.
- Owner Orders tab: latest 100 orders, private receipts, authenticated/CSRF-protected sequential fulfilment of paid allocated orders. Refunds, unpaid orders and stock holds cannot advance.
- Checkout blocks stale or unavailable bag lines, has a local-server fallback for payment redirection, and aligns delivery/help text.
- Confirmation page uses saved order timeframes and does not claim email delivery. Existing payment verification remains authoritative.
- Owner catalogue warnings highlight unusually low prices, likely wrong categories, combined sizes and colours without changing inventory.
- Email panel reports missing credentials or test-recipient restrictions. Existing provider acceptance and bounded retries remain distinct from inbox delivery.
- Keeps existing logo/font design; improves keyboard/reduced-motion gallery use and small-screen order wrapping.

Validation: full npm test passed 67 tests; JS syntax and git diff whitespace checks passed. Added route, owner permission/state transition, email delivery and catalogue regression cases.

Still required:
- Deploy this source, then verify a nonexistent /api/order/<64 hex chars> returns JSON 404, not homepage HTML. Do not make another charge just to test this route.
- Reopen an existing private paid-order link and reconcile payment. Check the provider webhook URL and delivery logs in the signed-in accounts; these were not accessed.
- Confirm Resend sending domain and sender, then remove EMAIL_TEST_RECIPIENT only when ready for real recipients. No email was sent in this audit.
- Confirm intended prices for the current 15-naira Tote bag and 100-naira Couch bag. Correct five footwear categories and enter actual stock by individual size/colour in admin. Do not guess or duplicate stock across variants.
- Publish owner-approved shipping/returns/privacy text; the current cloud content writer is not connected. No legal policy was invented.
- Browser mobile visual review and deployed admin/SQL permissions remain unverified. The API tests use provider mocks.

Deployment must REMOVE api/order/[token].js and api/order/[token]/[action].js. Prefer the Git branch change over extracting over an old checkout. The clean source ZIP has no secrets, database, node_modules, duplicate project folders or .git.
