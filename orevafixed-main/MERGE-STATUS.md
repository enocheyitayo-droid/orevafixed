# Merged review build — 2026-10-03

This is a local review package, not a verified live release.

Base: uploaded Oreva-Order-Confirmation-Email-Final.zip. Keeps bagz_orders and its checkout; does NOT replace it with the incompatible oreva_orders backend.
Restored earlier CSS files; retained the newer confirmation layout and checkout logic.
Added service-only email jobs, owner Emails tab, retry controls and stable provider idempotency keys.

## Connect email testing
1. Verify migrations 001–006 are already applied. Do not rerun them blindly.
2. Apply only supabase/migrations/007_email_queue.sql once in Supabase SQL editor. This is SQL; this document is NOT SQL.
3. In Vercel server environment set RESEND_API_KEY privately; EMAIL_FROM=Orẽva <onboarding@resend.dev>; EMAIL_TEST_RECIPIENT to the email registered with Resend; SITE_ORIGIN=https://oreva-ashy.vercel.app.
4. Keep Paystack in TEST mode. This inherited checkout accepts live keys, but live payments have not been authorized or tested.
5. Deploy, make a test order using that same recipient, and inspect Emails in the owner dashboard and Resend logs.

After domain verification, change EMAIL_FROM to the verified sender and remove EMAIL_TEST_RECIPIENT.

## Checks completed
JavaScript syntax checks passed. Five SQL queue checks passed in isolated PGlite: duplicate enqueue, exclusive claim, failed retry, accepted suppression and anonymous access denial.

## Remaining work
No deployment, real email send, mobile visual verification or hosted migration performed in this batch.
Existing uploaded backend still lacks owner order management, refund tools and reports. Those require further integration against bagz_orders.
Email jobs are created after payment commit; a database outage during enqueue still requires reconciliation from paid orders. Automatic reconciliation, owner alerts, fulfilment emails and delivery/bounce webhooks remain to implement. Accepted means provider accepted, NOT delivered. Retries beyond 23 hours deliberately require provider-log review to avoid duplicate sends outside the provider idempotency window.
Do not treat this ZIP as fully production-ready.
