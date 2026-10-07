-- BAGZ & CO. cloud catalogue foundation. Does not enable checkout.
-- Review and run as project administrator in Supabase SQL Editor.
begin;
create schema if not exists bagz_private;
revoke all on schema bagz_private from public, anon, authenticated;
create table if not exists bagz_private.owners (
  singleton boolean primary key default true check(singleton),
  user_id uuid not null unique references auth.users(id)
);
alter table bagz_private.owners enable row level security;
create or replace function public.bagz_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from bagz_private.owners where user_id=auth.uid());
$$;
revoke all on function public.bagz_is_owner() from public,anon;
grant execute on function public.bagz_is_owner() to authenticated;
create table if not exists public.bagz_products (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 120),
 description text not null check(length(description) between 1 and 3000),
 category text not null check(category in ('Bags','Shoes')),
 visible boolean not null default false,
 archived boolean not null default false,
 material text not null default '' check(length(material)<=300),
 care text not null default '' check(length(care)<=2000),
 photos text[] not null default '{}' check(cardinality(photos)<=8),
 created_at timestamptz not null default now()
);
create table if not exists public.bagz_variants (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.bagz_products(id),
 colour text not null check(length(trim(colour)) between 1 and 80),
 size text not null check(length(trim(size)) between 1 and 80),
 price integer not null check(price between 100 and 100000000),
 cost integer not null default 0 check(cost between 0 and 100000000),
 stock integer not null default 0 check(stock between 0 and 100000),
 reserved integer not null default 0 check(reserved>=0 and reserved<=stock)
);
create table if not exists public.bagz_settings (
 id boolean primary key default true check(id),
 value jsonb not null default '{"brand":"BAGZ & CO.","logo":"/brand-logo.png","tagline":"Carry your story.","whatsapp":"","pickupInstructions":"Pickup instructions will be shared by the owner.","pickupTime":"1–2 working days after payment","deliveryAreas":[],"bagDisplay":"","shoeDisplay":""}'::jsonb
);
insert into public.bagz_settings(id) values(true) on conflict do nothing;
create table if not exists public.bagz_stock_history (
 id uuid primary key default gen_random_uuid(),
 variant_id uuid not null references public.bagz_variants(id),
 delta integer not null,
 reason text not null check(length(trim(reason)) between 1 and 300),
 actor uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.bagz_products enable row level security;
alter table public.bagz_variants enable row level security;
alter table public.bagz_settings enable row level security;
alter table public.bagz_stock_history enable row level security;
-- No anonymous table access: the catalogue function deliberately omits supplier costs.
revoke all on public.bagz_products,public.bagz_variants,public.bagz_settings,public.bagz_stock_history from anon,authenticated;
grant select on public.bagz_products,public.bagz_variants,public.bagz_settings,public.bagz_stock_history to authenticated;
create policy bagz_owner_products_read on public.bagz_products for select to authenticated using(public.bagz_is_owner());
create policy bagz_owner_variants_read on public.bagz_variants for select to authenticated using(public.bagz_is_owner());
create policy bagz_owner_settings_read on public.bagz_settings for select to authenticated using(public.bagz_is_owner());
create policy bagz_owner_stock_read on public.bagz_stock_history for select to authenticated using(public.bagz_is_owner());
create or replace function public.bagz_catalogue() returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('mode','disabled','settings',
 (select jsonb_build_object('brand',value->>'brand','logo',value->>'logo','tagline',value->>'tagline','whatsapp',value->>'whatsapp','pickupInstructions',value->>'pickupInstructions','pickupTime',value->>'pickupTime','deliveryAreas',value->'deliveryAreas','bagDisplay',value->>'bagDisplay','shoeDisplay',value->>'shoeDisplay') from public.bagz_settings where id),
 'content','{}'::jsonb,'products',coalesce((select jsonb_agg(jsonb_build_object(
 'id',p.id,'name',p.name,'description',p.description,'category',p.category,
 'photo',coalesce(p.photos[1],''),'photos',p.photos,'material',p.material,'care',p.care,'sample',false,
 'variants',(select jsonb_agg(jsonb_build_object('id',v.id,'colour',v.colour,'size',v.size,'price',v.price,'available',v.stock-v.reserved)) from public.bagz_variants v where v.product_id=p.id)
 ) order by p.created_at desc) from public.bagz_products p where p.visible and not p.archived and exists(select 1 from public.bagz_variants v where v.product_id=p.id)), '[]'::jsonb));
$$;
revoke all on function public.bagz_catalogue() from public;
grant execute on function public.bagz_catalogue() to anon,authenticated;
create or replace function public.bagz_save_product(item jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pid uuid; vid uuid; v jsonb; seen uuid[]='{}'; oldrow public.bagz_variants; paths text[]; image_path text;
begin
 if not public.bagz_is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 pid=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
 perform pg_advisory_xact_lock(hashtextextended(pid::text,0));
 if exists(select 1 from public.bagz_products where id=pid and archived) then raise exception 'Product was deleted'; end if;
 if jsonb_typeof(item->'variants') is distinct from 'array' or jsonb_array_length(item->'variants') not between 1 and 60 then raise exception 'Add 1–60 variants'; end if;
 if jsonb_typeof(coalesce(item->'photos','[]'::jsonb)) <> 'array' then raise exception 'Invalid photos'; end if;
 select coalesce(array_agg(value),'{}') into paths from jsonb_array_elements_text(coalesce(item->'photos','[]'::jsonb));
 foreach image_path in array paths loop
  if image_path !~ '^[a-f0-9-]+\.(webp|jpg|jpeg|png)$' or not exists(select 1 from storage.objects where bucket_id='bagz-photos' and name=image_path) then raise exception 'Use an uploaded photo'; end if;
 end loop;
 insert into public.bagz_products(id,name,description,category,visible,material,care,photos)
 values(pid,trim(item->>'name'),item->>'description',item->>'category',coalesce((item->>'visible')::boolean,false),coalesce(item->>'material',''),coalesce(item->>'care',''),paths)
 on conflict(id) do update set name=excluded.name,description=excluded.description,category=excluded.category,visible=excluded.visible,material=excluded.material,care=excluded.care,photos=excluded.photos;
 for v in select value from jsonb_array_elements(item->'variants') loop
  vid=coalesce(nullif(v->>'id','')::uuid,gen_random_uuid());
  if vid=any(seen) then raise exception 'Duplicate variant'; end if; seen=array_append(seen,vid);
  select * into oldrow from public.bagz_variants where id=vid for update;
  if found and oldrow.product_id<>pid then raise exception 'Variant belongs to another product'; end if;
  insert into public.bagz_variants(id,product_id,colour,size,price,cost,stock)
  values(vid,pid,trim(v->>'colour'),trim(v->>'size'),(v->>'price')::integer,(v->>'cost')::integer,(v->>'stock')::integer)
  on conflict(id) do update set colour=excluded.colour,size=excluded.size,price=excluded.price,cost=excluded.cost,stock=excluded.stock;
  if coalesce(oldrow.stock,0)<>(v->>'stock')::integer then
   insert into public.bagz_stock_history(variant_id,delta,reason,actor) values(vid,(v->>'stock')::integer-coalesce(oldrow.stock,0),'Product editor stock update',auth.uid());
  end if;
 end loop;
 if exists(select 1 from public.bagz_variants where product_id=pid and not(id=any(seen))) then raise exception 'Keep existing variants; set their stock to zero instead'; end if;
 return pid;
end $$;
create or replace function public.bagz_delete_product(product uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.bagz_is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 update public.bagz_products set archived=true,visible=false where id=product;
 if not found then raise exception 'Product not found'; end if;
end $$;
revoke all on function public.bagz_save_product(jsonb),public.bagz_delete_product(uuid) from public,anon;
grant execute on function public.bagz_save_product(jsonb),public.bagz_delete_product(uuid) to authenticated;
-- Private originals. Image publication will go through the upload/backend adapter.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('bagz-photos','bagz-photos',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy bagz_owner_upload on storage.objects for insert to authenticated with check(bucket_id='bagz-photos' and public.bagz_is_owner());
create policy bagz_owner_read_upload on storage.objects for select to authenticated using(bucket_id='bagz-photos' and public.bagz_is_owner());
commit;

