# Orẽva owner access and deployment

## Start using the owner dashboard locally

With the local server running, open http://127.0.0.1:3100/admin/setup on this computer. Choose your own email and a unique password of at least 14 characters. After account creation this setup route closes. Sign in at /admin. Four quick clicks/taps on the HEADER logo also open /admin; this shortcut does not bypass authentication.

Products: Add product, upload JPEG/PNG/WebP from your device, enter real name/description/category, price and supplier cost, colour/size variants and physical quantities, then save. Use Edit to change these later. Delete removes a product from the catalogue and preserves historical orders. Inventory supports audited quantity adjustments. Stock already reserved cannot be reduced below active reservations.

Settings: Homepage display pictures has separate bag and slip-on uploads. These replace the former illustrated sample panels once uploaded. Use photos you are entitled to publish. Display photos are style inspiration, not inventory; create a product separately to sell it. The requested Coach bag/slip-on photos are not included because they have not yet been supplied.

Samples have been removed from the active local catalogues. The release ZIP contains no database, owner credentials, customer records or sample seed data. A newly started database is empty.

## What is deployed

The public site is hosted at `https://oreva-ashy.vercel.app`. Vercel serves the storefront and owner product/image functions; Supabase provides Auth, catalogue data, settings, and image storage. Order management, transactional stock reservations, notifications and checkout have not yet been migrated, so purchases remain disabled.

## Vercel and Supabase setup

The current serverless slice requires these Vercel Production environment variables:

`SUPABASE_URL` — the HTTPS project URL, for example `https://PROJECT.supabase.co`.

`SUPABASE_ANON_KEY` — the project's public anon/publishable key. This is not the service-role key.

Set them in Vercel Project Settings → Environment Variables, then redeploy. `/api/shop` reads `bagz_catalogue` and `bagz_storefront_gallery`. Before using owner products or image tools, run migrations `001_catalogue.sql`, `002_designated_owners.sql` (if not already applied), and `003_store_media_and_settings.sql` in the Supabase SQL Editor. `003` creates the sanitized public media bucket and owner-only image policies; it does not make the existing private photo bucket public.

After those migrations, sign in at `https://oreva-ashy.vercel.app/admin` with a Supabase Auth account designated in `bagz_private.owners`. The Admin Products tab can add, edit, archive and manage product photos. The Images tab manages up to eight scrolling homepage images; upload, remove or clear images, then save. Settings can update branding and delivery details. Never add a service-role key to Vercel or browser code; the functions use the anon key plus the signed-in owner session and database owner checks.

## Payments are a separate activation step

Paystack and email activation are not part of this deployment slice. Do not add Paystack keys yet. The order schema, atomic stock reservation, signed webhook verification, provider reconciliation, receipts and fulfilment flow must be migrated and tested before adding Paystack **test** keys. Live keys remain disabled.

## Verification

SQLite backend tests remain in place. `test/vercel-api.test.mjs` and `test/vercel-admin.test.mjs` cover the Vercel catalog, owner login/authorization and product RPC calls using mocked Supabase responses. Apply migration `003` and verify owner sign-in and image persistence on the hosted project before relying on the dashboard. Hosted commerce and checkout are not yet implemented.
