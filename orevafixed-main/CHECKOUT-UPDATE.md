Checkout UI update: replace public/app.js, public/index.html, and add public/checkout.css.
Adds Buy now (adds selected quantity to existing bag and proceeds to checkout), retains stock validation and Paystack hosted payment.
Styles are scoped to checkout; header and home styles unchanged.
JavaScript syntax checked. Browser verification pending.
The database checkout error is not fixed by these visual changes. Run supabase/CHECK-CHECKOUT.sql (read-only) for diagnostics. Do not rerun migration 007 or drop the existing email table.
