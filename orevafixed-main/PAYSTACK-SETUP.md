# Orẽva Paystack + Vercel setup

## 1. Supabase
Run the SQL migrations in order in Supabase SQL Editor. If 001-004 are already applied, run only:

- `supabase/migrations/005_live_paystack.sql`

## 2. Vercel environment variables
Add these to the Production environment (and Preview if desired):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `SITE_ORIGIN=https://your-domain.com`
- `PAYSTACK_SECRET_KEY=sk_test_...` while testing

Redeploy after changing environment variables.

## 3. Paystack webhook
In Paystack Dashboard, set the webhook URL to:

`https://your-domain.com/api/webhook/paystack`

The checkout endpoint initializes payment on the server, redirects customers to Paystack's hosted checkout, and the webhook verifies successful charges before the order is marked paid.

## 4. Test first
Use your Paystack test secret key (`sk_test_...`) until checkout, redirects, order status, and webhook confirmation all work correctly.

## 5. Go live
When you are ready to accept real money:

1. Complete Paystack business activation.
2. Replace the Vercel `PAYSTACK_SECRET_KEY` with the live secret key (`sk_live_...`).
3. Confirm `SITE_ORIGIN` is your final HTTPS domain.
4. Confirm the live webhook URL in Paystack.
5. Redeploy.

Never put the Paystack secret key in `public/`, frontend JavaScript, GitHub, or HTML.
