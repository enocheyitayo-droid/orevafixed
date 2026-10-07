# Orẽva post-payment setup

This build adds:
- A proper "Your order has been placed" confirmation screen after Paystack verifies payment.
- Delivery/pickup method and expected timeframe on the order screen.
- Customer confirmation email after payment verification.
- Standard Nigeria delivery wording: expected 2–5 working days after payment.
- ACU pickup uses the configured pickup timeframe (default 1–2 working days after payment).
- Lighter checkout typography and improved mobile logo sizing.

## Transactional email (Resend)

Add these server-side variables in Vercel → Project Settings → Environment Variables:

RESEND_API_KEY=re_...
EMAIL_FROM=Orẽva <orders@shopwithoreva.ng>

Use a Resend sending domain that you own and have verified. Keep the API key server-side only.

After adding or changing Vercel environment variables, redeploy the latest production deployment.

The payment webhook and manual payment verification both attempt the same confirmation email. The request uses a stable idempotency key so duplicate payment callbacks do not intentionally produce duplicate confirmations.


## Production receipt checklist
- Set `SITE_ORIGIN=https://shopwithoreva.ng` in Vercel Production.
- Set `EMAIL_FROM=Orẽva <orders@shopwithoreva.ng>` (or another verified sender on the domain).
- REMOVE `EMAIL_TEST_RECIPIENT` after Resend domain verification, otherwise real customer receipts are intentionally blocked.
- Apply `supabase/migrations/007_email_queue.sql`; receipt emails depend on this queue.
- Set the Paystack webhook URL to `https://shopwithoreva.ng/api/webhook/paystack`.
- After payment, Paystack returns to `/order/<private-token>`. The page verifies payment, shows the order confirmation, and exposes Print / save receipt.
