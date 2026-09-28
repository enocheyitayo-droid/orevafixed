# Orẽva — source repository

Updated branding and five owner-supplied display photos are included. Images are inspiration, not products with invented stock or prices.

## Run locally
Requires Node.js 24.13 or newer. Run npm ci, copy .env.example to .env, then npm start. Checkout is disabled by default. Do not run the optional sample seed for a real catalogue.

## Git upload
Extract this ZIP and upload its contents to your repository. Never commit .env, database files, uploads containing private data, node_modules or deployment credentials. The included .gitignore excludes these.

## Deployment status — read before importing
The storefront and owner product/image APIs run as Vercel Functions backed by Supabase. Vercel needs `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Run migrations 001, 002 (if not already applied), and 003 in Supabase before using owner product/image tools. Order management, persistent stock reservations, notifications and checkout are not yet migrated; the local Node server uses SQLite and is not suitable for ephemeral serverless storage.

Vercel Hobby is restricted to personal non-commercial use. A business storefront requires a commercial-eligible plan; Pro currently starts at USD 20/month plus additional usage/taxes. See https://vercel.com/docs/limits/fair-use-guidelines . No paid plan has been purchased and no live payments are enabled.

The Vercel functions rely on the existing Supabase project and explicitly designated Supabase Auth owners. A Git push alone does not apply database migrations or enable checkout.

Supabase migrations are included for reference. Do not rerun the already-applied initial migration. Hosted branding still needs updating when the cloud adapter is connected.
