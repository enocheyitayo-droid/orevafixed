# Upload this clean project

The ZIP has package.json, api, public and supabase directly at its root. Extract to a NEW empty folder. Do not extract inside one of the old project copies.

For your existing Git checkout: back up/commit first, replace application files with these files, and remove obsolete tracked oreva-merged/ and oreva_postpayment/ directories and api/admin/[action].js if present. Preserve .git and private local .env files. Never upload private .env files. Review git status before committing. Deploy to a preview branch first.

This fixes package layout only. Read MERGE-STATUS.md for unfinished functionality and test limits. Migration 007 and Vercel email configuration are still required; no hosted settings were changed. Keep Paystack in test mode.

Resend test recipient: shopwithoreva@gmail.com
EMAIL_FROM: Orẽva <onboarding@resend.dev>
Keep RESEND_API_KEY private in Vercel.

Validation: 32 JavaScript syntax checks and 5 mocked Paystack unit tests passed. No real payment, email or deployment test was performed.
