# Current release

Read [START-HERE.md](START-HERE.md) first for current deployment limitations.

# Latest owner release

Start with [OWNER-AND-DEPLOY.md](OWNER-AND-DEPLOY.md) for current owner access and Vercel/backend setup. Checkout can now remain disabled while you manage real stock. The older sample-seeding instructions below are for isolated development only.

# Orẽva — Timeless elegance.

A working mobile-first storefront and owner dashboard for Orẽva, a bag and shoe business. The supplied logo is included. No real stock, reviews, phone number, delivery areas, or business email has been invented.

## Run locally

Requires **Node.js 24.13 or newer** (includes `node:sqlite`). From this directory:

```powershell
npm ci --ignore-scripts
Copy-Item .env.example .env
npm run seed
npm start
```

Open **http://127.0.0.1:3100**. Always use the server URL; opening `public/index.html` directly cannot run the API. Use `127.0.0.1` consistently rather than switching to `localhost`, because mutation requests validate the configured origin.

`npm run seed` is optional. It adds four explicitly labelled illustrated development samples. Production refuses sample seeding and excludes sample products. The default adapter **does not take money**. It provides labelled success/failure/abandonment controls at the checkout step, disabled in production. Emails are stored as a labelled development outbox in the owner dashboard, not sent.

### Create your private owner account

```powershell
.\setup-owner.ps1
```

The script prompts for your email and password without echoing the password, provisions a scrypt password hash, and clears the temporary password environment variable. Use at least 14 characters. Then visit **http://127.0.0.1:3100/admin**. There is no default login, signup route, or demo admin bypass. Running setup again resets the owner login and revokes all sessions. On other systems, supply `OWNER_EMAIL` and `OWNER_PASSWORD` securely to `npm run owner`, then unset them; do not commit credentials.

## Owner workflow

- **Products:** add genuine photos, descriptions, Bags/Shoes category, colour/size options, naira prices, supplier costs and physical quantities. Set visibility. Existing variants stay in order history; set a variant's quantity to zero or hide the product instead of deleting history. Active reservations prevent lowering physical stock below reserved quantities.
- **Orders:** inspect customer details, item snapshots, payment references, private receipt links and separate payment/fulfilment states. Advance Paid → Preparing → Ready for pickup / Out for delivery → Completed. Reconcile any uncertain payment directly against Paystack.
- **Custom orders:** after WhatsApp discussion, set aside physically available items that are not also counted in catalogue stock, enter agreed customer/item details, and create a private 30-minute payment link. Share that link yourself. The same verification, receipt, tracking and notification pipeline applies. Requests alone do not create orders or take payment.
- **Money:** record actual expenses, including courier costs and Paystack fees. Revenue includes delivery charges and subtracts confirmed refunds. Estimated profit subtracts checkout-time supplier-cost snapshots and recorded expenses; tax/unrecorded expenses are not inferred. Test orders affect reports in test mode.
- **Settings:** replace branding/logo, add your actual WhatsApp number, owner email, pickup instructions, pickup timeframe, local delivery areas/fees/timeframes, low-stock threshold and notification preferences. No delivery destinations or fees are offered until configured.
- **Notifications:** see unread dashboard alerts, email bodies, failure reasons, attempts and retry controls. Enable push separately on each supported device.

## Payment safety and Paystack test setup

Set `PAYMENT_ADAPTER=paystack` and `PAYSTACK_SECRET_KEY` to your **test** secret (`sk_test_…`). Never put it in frontend code. The build intentionally rejects `sk_live_…` keys; live activation requires a deliberate code change and your instruction after staging acceptance.

Configure Paystack's **test webhook URL** as `https://YOUR-STAGING-DOMAIN/api/webhook/paystack` when you explicitly choose to deploy a private staging environment. Set `BASE_URL` to that exact HTTPS origin. No deployment or webhook registration was performed for you.

Checkout prices, fees and currency come from the server, in integer kobo. The customer sees a server-generated final order summary before following the payment link. Only Paystack's hosted page collects card details. A redirect never marks the order paid. Every `charge.success` webhook must pass HMAC-SHA512 verification of its raw bytes, then the server independently calls Paystack's transaction verification API. It compares reference, amount, NGN currency, associated order metadata, customer email, transaction ID and test domain before settlement.

SQLite `BEGIN IMMEDIATE` transactions serialize competing stock reservations. Reservations last 30 minutes and expire even while the app is down because availability queries compare timestamps. Stock is deducted once only after verified success, in the same transaction as the receipt and notification outbox. Duplicate webhooks return the same paid order without further deductions or outbox rows. Receipt/order numbers are unique. Checkout idempotency keys prevent repeated form submissions from creating another order.

If payment arrives after expiry, the server atomically rechecks stock. If available, it allocates it; otherwise it records the money as paid, holds fulfilment and alerts the owner for customer contact/refund. Cancelled orders and expired custom reservations cannot silently allocate late money. Never dispatch an order marked On hold. Pending/failed/abandoned orders can still be reconciled if Paystack later confirms success. A background sweep checks recent unconfirmed orders; webhooks and explicit owner reconciliation handle delayed events.

### Cancellation and refunds

Cancelling an order releases an unpaid reservation but **does not pretend to refund money or return physical goods**. Initiate a refund in your Paystack dashboard. In this app, enter that refund ID using “Verify a Paystack refund.” The server fetches it and only records a `processed` NGN refund tied to the original verified transaction, with a cumulative amount no higher than payment. Duplicate refund IDs are harmless. Pending/failed refunds are not counted as money returned.

Use “Confirm return & restock” only after cancelled items are physically available again. It restocks once and reverses their supplier cost in estimated profit. For completed orders, handle the return with the customer and verify the provider refund; the completed order is not silently cancelled/restocked. A dedicated partial-return workflow is not included.

## Email and optional Web Push

For email set `EMAIL_ADAPTER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` from a verified sending domain. Add your owner email in Settings. Successful payment produces an owner email and customer confirmation containing itemised receipt and private order link. Fulfilment/cancellation/refund changes send customer updates. The worker runs every 30 seconds. Failures remain in the outbox for owner retries without rolling back payment.

Resend requests use one stable idempotency key per outbox message. Ambiguous retries more than 23 hours old stop for manual provider inspection rather than risk resending beyond Resend's 24-hour idempotency window. Check the provider before a manual resend. Push notifications use generic text and a stable notification tag; no customer name, phone, address or amount appears on a lock screen.

Generate VAPID keys with `npx web-push generate-vapid-keys`, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a real owner `mailto:` address or HTTPS URL). Enable owner push in Settings. Open Notifications → “Enable on this device” and accept your browser prompt. Outside localhost, use HTTPS. On supported iOS/iPadOS devices, first add the site to the Home Screen and open that installed app. Unsupported/denied devices retain email and dashboard notifications. Actual device delivery needs your credentials and a device acceptance check.

## Security and persistence

The backend uses parameterised SQL, server-side validation, HttpOnly/SameSite owner sessions, CSRF tokens plus same-origin enforcement, login/write rate limits, restrictive CSP, no-store responses, no-referrer links and a fixed static-file allowlist. Private order URLs contain 256-bit random capabilities; treat them like confidential documents. Do not log their full URLs at the reverse proxy. HTTPS adds Secure cookies and HSTS in production. Sessions expire after 12 hours. Password changes through the owner setup tool revoke all sessions.

Uploads require owner authentication/CSRF and accept at most 5 MB. Sharp decodes only JPEG/PNG/WebP inputs with a 24-megapixel limit, strips metadata, resizes and re-encodes as WebP with random filenames. SVG/HTML uploads are rejected. Original uploaded metadata is never published. The supplied static logo and built-in sample illustrations are trusted packaged assets.

Keep the SQLite database, WAL files and upload directory on a persistent local disk. This version targets a small shop on **one app instance**, not horizontally scaled serverless hosting. Back up the database using SQLite's backup API (or stop the server and back up the complete `data` directory) plus uploads; test restoration. Protect backups and restrict database access because they contain customer details and private order links.

## Deployment preparation — not deployed

The included Dockerfile runs as a non-root user. Build with `docker build -t bagz-store .`. At deployment, provide environment secrets, mount persistent storage at `/app/data`, place an HTTPS reverse proxy in front, set `BASE_URL`, and use a single instance. Health check: `/health`. Do not serve the `data` directory or source tree as static files. Never use an ephemeral filesystem for stock or orders. Production startup requires HTTPS, configured Resend and Paystack **test** credentials. Start with a clean production database and real inventory; do not carry test orders into launch accounting.

## Verification

```powershell
npm test
```

See `TEST-RESULTS.md` for the executed tests, browser checks and limits. Tests use isolated databases, `.test` emails, clearly labelled fixtures, and mocked provider responses; they do not charge or send emails. Windows environments that block child processes use the supplied Node test runner's `--test-isolation=none`; the stock race still uses two actual worker threads with separate SQLite connections.

## Before launch

1. Create your owner login; add real products/photos/stock, supplier costs, contact number, pickup arrangements and delivery fees/timeframes.
2. Supply Paystack test and Resend credentials, register the test webhook, configure optional VAPID, and exercise success, failure, delayed payment, refund and delivery on private HTTPS staging.
3. Confirm real email delivery and owner push on your devices; inspect spam and notification-denial behaviour.
4. Set your actual returns/refunds/privacy policies, data retention procedure, taxes where applicable and customer support process. No policies or legal claims were invented.
5. Set up encrypted backups, restoration checks, uptime/error monitoring, and access restrictions. Reconcile test transactions and reports.
6. Only after your explicit instruction should live-payment support be enabled and the site published. Neither has been done.

## Reference documentation

- [Paystack payment verification](https://paystack.com/docs/payments/verify-payments/)
- [Paystack signed webhooks](https://paystack.com/docs/payments/webhooks/)
- [Paystack refund API](https://paystack.com/docs/api/refund/)
- [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)

The frontend is intentionally small vanilla JavaScript/CSS, with Node HTTP and transactional SQLite on the server. This keeps installation and maintenance light while providing real persistence and server-owned stock/payment rules. Sharp and web-push are the only application dependencies.

## Design assets

The original supplied Orẽva logo is retained in `public/oreva-logo.jpg`. The reference-inspired homepage uses `public/editorial.css` and an AI-generated abstract brown material texture in `public/editorial-hero.png`. That texture is decorative artwork, not a claim about product materials. Catalogue samples remain labelled illustrations until the owner supplies real product photographs. The final header is monochrome black/white, with the original layout and logo dimensions preserved.
