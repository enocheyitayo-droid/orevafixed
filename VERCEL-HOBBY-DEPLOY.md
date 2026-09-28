# Oreva — Vercel Hobby Deployment

This build consolidates the seven separate `/api/admin/*` serverless files into one dynamic function: `/api/admin/[action].js`.

## Function count

This package contains 9 Vercel API function files, below the 12-function deployment limit that triggered the previous build failure.

Existing browser URLs remain unchanged, including:
- `/api/admin/me`
- `/api/admin/overview`
- `/api/admin/product`
- `/api/admin/delete-product`
- `/api/admin/settings`
- `/api/admin/upload`
- `/api/admin/logout`

## Deploy

From the project folder:

```bash
git add .
git commit -m "Reduce Vercel functions for Hobby deployment"
git push origin main
```

If Vercel is connected to the GitHub repository, the push triggers a new deployment automatically.

## Required Vercel environment variables

Set these in Vercel → Project → Settings → Environment Variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYSTACK_SECRET_KEY`
- `SITE_ORIGIN`

Do not commit real secret values to GitHub.

For testing, use a Paystack `sk_test_...` secret key. When the store is ready for live payments, use the live secret in Vercel and redeploy.

## Supabase

Apply migrations in `supabase/migrations/`, including `005_live_paystack.sql` if it has not already been applied.

## Paystack webhook

Configure the Paystack webhook URL as:

`https://YOUR-DOMAIN/api/webhook/paystack`

For the current Vercel address, use the production Vercel URL. Update `SITE_ORIGIN` after connecting the final custom domain.
