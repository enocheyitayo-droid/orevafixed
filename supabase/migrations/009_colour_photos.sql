begin;
create table if not exists public.oreva_colour_photos (
 product_id uuid primary key references public.bagz_products(id) on delete cascade,
 mapping jsonb not null default '{}'::jsonb
);
alter table public.oreva_colour_photos enable row level security;
grant select on public.oreva_colour_photos to anon, authenticated;
create policy colour_photos_read on public.oreva_colour_photos for select using (true);
create or replace function public.oreva_save_product_photos(item jsonb, mapping jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare product uuid; colour text; photo text;
begin
 if not public.bagz_is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 if jsonb_typeof(mapping) is distinct from 'object' or octet_length(mapping::text)>20000 then raise exception 'Invalid colour photos'; end if;
 for colour,photo in select key,value from jsonb_each_text(mapping) loop
  if length(colour)>80 or not (item->'photos' @> jsonb_build_array(photo)) then raise exception 'Choose a product photo for each colour'; end if;
 end loop;
 product=public.bagz_save_product(item);
 insert into public.oreva_colour_photos(product_id,mapping) values(product,mapping)
 on conflict(product_id) do update set mapping=excluded.mapping;
 return product;
end $$;
revoke all on function public.oreva_save_product_photos(jsonb,jsonb) from public,anon;
grant execute on function public.oreva_save_product_photos(jsonb,jsonb) to authenticated;
commit;
