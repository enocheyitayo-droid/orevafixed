# Supabase setup status — 2026-09-28

Project: yapvpsuzikhrmftiolgj

Applied 001_catalogue.sql in the Supabase SQL Editor, including explicit RLS on bagz_private.owners and explicit revocation of inherited anonymous function execution grants.

Verified in hosted PostgreSQL:
- All five application/owner tables have RLS enabled.
- Anonymous direct product and variant SELECT access is blocked.
- Anonymous product-save and product-delete execution is blocked.
- Anonymous catalogue execution is allowed; returns zero products and payment mode disabled.
- bagz-photos bucket is private.
- No designated owner exists yet.

Still needed: user creates their own email/password in Supabase Authentication > Users > Add user > Create new user. Designate the resulting UUID in bagz_private.owners, connect the cloud frontend and image adapter, test owner/non-owner access and uploads, then redeploy. The current Vercel frontend is not connected to this Supabase setup. Payments remain disabled. This catalogue migration is not the orders/payment migration.

## Owner assignment update
Applied 002_designated_owners.sql with user approval. Both confirmed accounts are now assigned: adetorooreoluwa27@gmail.com and enocheyitayo@gmail.com. Removed only the singleton primary-key constraint; existing unique user-ID constraint, foreign key and RLS remain. No products or accounts were deleted. Vercel-to-Supabase cloud connection still pending.
