-- Additive migration for the uploaded bagz_orders version. Run after 006.
begin;
create table public.oreva_email_jobs (
 key text primary key, payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','sending','accepted','failed')),
 attempts integer not null default 0, first_attempt timestamptz,
 lease_until timestamptz, claim uuid, error text not null default '', provider_id text,
 created_at timestamptz not null default now()
);
alter table public.oreva_email_jobs enable row level security;
revoke all on public.oreva_email_jobs from public, anon, authenticated;
grant select on public.oreva_email_jobs to service_role;
create function public.oreva_enqueue_email(job_key text,message jsonb) returns void
language sql security definer set search_path='' as $$
 insert into public.oreva_email_jobs(key,payload) values(job_key,message) on conflict(key) do nothing;
$$;
create function public.oreva_claim_email(job_key text,claim_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.oreva_email_jobs;
begin
 select * into j from public.oreva_email_jobs where key=job_key for update;
 if not found or j.status='accepted' or j.lease_until>now() or j.first_attempt<now()-interval '23 hours' then return null; end if;
 update public.oreva_email_jobs set status='sending',claim=claim_id,lease_until=now()+interval '2 minutes',first_attempt=coalesce(first_attempt,now()),attempts=attempts+1 where key=job_key;
 return jsonb_build_object('payload',j.payload);
end $$;
create function public.oreva_finish_email(job_key text,claim_id uuid,new_status text,failure text,provider_id text) returns void
language sql security definer set search_path='' as $$
 update public.oreva_email_jobs set status=new_status,error=left(failure,500),provider_id=oreva_finish_email.provider_id,lease_until=null
 where key=job_key and claim=claim_id and status='sending';
$$;
revoke all on function public.oreva_enqueue_email(text,jsonb),public.oreva_claim_email(text,uuid),public.oreva_finish_email(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.oreva_enqueue_email(text,jsonb),public.oreva_claim_email(text,uuid),public.oreva_finish_email(text,uuid,text,text,text) to service_role;
commit;
