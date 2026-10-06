# ORẼVA — deploy this build now

This ZIP is intentionally packaged with `vercel.json`, `api/`, `public/`, and `package.json` at the ZIP root. Deploy THIS folder as the Vercel project root.

## 1. Vercel Production environment variables
Add these under Project → Settings → Environment Variables → Production:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYSTACK_SECRET_KEY`
- `SITE_ORIGIN=https://shopwithoreva.ng`
- `RESEND_API_KEY`
- `EMAIL_FROM=Orẽva <orders@shopwithoreva.ng>`
- `OWNER_NOTIFICATION_EMAIL` (your order-alert email)

If your Resend domain is verified, DELETE `EMAIL_TEST_RECIPIENT` or leave it unset. If it is set, customer receipts are restricted to that test address.

## 2. Supabase
Make sure migrations through `008_site_content.sql` have been applied. Receipt emails specifically require `007_email_queue.sql`.

## 3. Paystack
Set the webhook URL in Paystack to:

`https://shopwithoreva.ng/api/webhook/paystack`

Paystack checkout returns customers to the private order URL automatically because `SITE_ORIGIN` is set to your domain.

## 4. Verify after deployment
Open:

`https://shopwithoreva.ng/api/health`

You should see `{ "ok": true, "backend": "vercel-function" }`. This confirms the Vercel API function is deployed. Then test checkout to confirm the production environment variables are present.

Then place a small test order. After payment the expected flow is:

Paystack → `/order/<private-token>` → payment verification → “Your order has been placed” → receipt shown → confirmation email queued through Resend.

The order page has a **Print / save receipt** button, so the customer can save the receipt as PDF from the browser.
