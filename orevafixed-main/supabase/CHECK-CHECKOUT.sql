-- READ ONLY: run in Supabase SQL Editor and share the result.
select n.nspname as schema, p.proname as function_name,
 pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.proname in ('bagz_create_checkout','gen_random_bytes','oreva_enqueue_email','oreva_claim_email','oreva_finish_email')
order by p.proname,n.nspname;
select to_regclass('public.bagz_orders') as orders_table,
 to_regclass('public.oreva_email_jobs') as email_table;
