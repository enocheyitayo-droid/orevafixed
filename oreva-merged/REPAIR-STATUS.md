# Orẽva repair review — 2026-09-28

Based on GitHub main b9e27132de3d5aed08ba8535e48e789cad00d1c5, compared with the supplied ZIP. Text source matches after line-ending normalization; the GitHub logo asset was retained.

Fixed locally:
- Legacy default BAGZ branding is presented as Orẽva without overwriting custom owner branding.
- Default five supplied display photos remain visible when no custom image rail is configured.
- Refreshed sessions return the newly generated CSRF token instead of an empty token.
- Empty CSRF tokens are rejected and malformed cookies do not crash authentication.
- Cloud dashboard labels unconnected financial/order metrics instead of presenting invented zero results.
- Upload limit is 4 MB to leave room below Vercel request-body limits.
- Reduced-motion treatment for animated image rail.
- Added current Vercel/Supabase environment example without credentials.

Validation: 56 tests passed, including four new regression tests. Local browser confirms brand and all five inspiration photos render. Existing payment tests use local SQLite/mocked providers; these do not establish working cloud payments. No real transactions or credentials used.

Not deployed. No database writes made during this repair.

Remaining launch work:
1. Implement Supabase transactional order reservation/expiry/settlement migrations and corresponding Vercel checkout, verify, webhook and order-status routes. Existing Vercel routes cover catalogue and admin product management only.
2. Migrate custom orders, fulfilment, expense/report data, verified refunds and notification outbox. Configure an actual email provider; optional push remains separate.
3. Owner browser login/upload/save checks against the deployed version; confirm media migration 003 is applied. One live product was visible without a photo. Do not infer which inspiration photo belongs to it.
4. Add Paystack TEST secret in hosting settings only after backend routes exist. Validate duplicate, late and concurrent payment flows against hosted PostgreSQL before enabling checkout.
5. Obtain actual WhatsApp contact, delivery settings and policies; attach custom domain after receiving its name.

The free Vercel Hobby plan is non-commercial. Choose a commercially eligible hosting plan before opening sales. See START-HERE.md.
