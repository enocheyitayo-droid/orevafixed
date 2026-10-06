# Final Oreva deployment

## Checkout
- Ajayi Crowther University pickup: free.
- Standard delivery anywhere in Nigeria: ₦4,000.
- Delivery customers enter state, city, full address and optional landmark.
- Paystack is initialized with the server-calculated final total.

## Required Supabase step
Run `supabase/migrations/006_flat_nigeria_delivery.sql` in the Supabase SQL editor after the earlier migrations. This makes the database calculate the same fixed ₦4,000 Nigeria delivery fee and keeps client totals untrusted.

## Vercel
Keep these production environment variables:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- PAYSTACK_SECRET_KEY
- SITE_ORIGIN=https://shopwithoreva.ng

Admin URLs such as `/api/admin/me` are rewritten to one admin function. Image uploads use one separate function because they require raw request bodies. Total functions: 10 (under the Hobby limit of 12 shown by the project).

## Admin
Open `/admin` directly. If no owner account has ever been created, open `/admin/setup` and follow the setup screen. Existing owner accounts continue using `/admin`.
