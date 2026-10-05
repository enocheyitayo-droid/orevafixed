begin;
create table if not exists public.oreva_site_content (
 id boolean primary key default true check(id),
 value jsonb not null default '{}'::jsonb
);
insert into public.oreva_site_content(id) values(true) on conflict do nothing;
alter table public.oreva_site_content enable row level security;
revoke all on public.oreva_site_content from public,anon,authenticated;
create or replace function public.oreva_read_content() returns jsonb
language sql stable security definer set search_path='' as $$
 select value from public.oreva_site_content where id=true;
$$;
create or replace function public.oreva_save_content(content jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare k text; clean jsonb='{}'::jsonb;
begin
 if not public.bagz_is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 if jsonb_typeof(content) is distinct from 'object' then raise exception 'Invalid content'; end if;
 foreach k in array array['about','shipping','returns','privacy','support_email'] loop
  if jsonb_typeof(content->k) is distinct from 'string' or length(content->>k)>case when k='support_email' then 254 else 10000 end then raise exception 'Invalid content field'; end if;
  clean=clean||jsonb_build_object(k,trim(content->>k));
 end loop;
 update public.oreva_site_content set value=clean where id=true;
 return clean;
end $$;
revoke all on function public.oreva_read_content(),public.oreva_save_content(jsonb) from public,anon,authenticated;
grant execute on function public.oreva_read_content() to anon,authenticated,service_role;
grant execute on function public.oreva_save_content(jsonb) to authenticated;
commit;
